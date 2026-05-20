"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkTradeIdea = checkTradeIdea;
exports.applyTrackingEvent = applyTrackingEvent;
const queries_1 = require("../database/queries");
const client_1 = require("../database/client");
const providers_1 = require("../providers");
const logger_1 = require("../utils/logger");
const time_1 = require("../utils/time");
const config_1 = require("../config");
const indicators_1 = require("../utils/indicators");
const log = (0, logger_1.createComponentLogger)('tracking');
const BREAKEVEN_ABS_PCT = 0.1;
function normalizeDirection(direction) {
    const normalized = String(direction || '').toUpperCase();
    return normalized === 'SHORT' || normalized === 'SELL' ? 'SHORT' : 'LONG';
}
function computeProfitPercent(idea, exitPrice) {
    const entry = typeof idea.entry_price === 'number' ? idea.entry_price : null;
    if (entry == null || entry <= 0 || !Number.isFinite(exitPrice))
        return null;
    const direction = normalizeDirection(idea.direction);
    const raw = direction === 'SHORT'
        ? ((entry - exitPrice) / entry) * 100
        : ((exitPrice - entry) / entry) * 100;
    return (0, indicators_1.round2)(raw);
}
function computeDurationMinutes(createdAt, closedAtIso) {
    if (!createdAt)
        return null;
    const start = new Date(createdAt).getTime();
    const end = new Date(closedAtIso).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
        return null;
    return Math.round((end - start) / 60000);
}
function mapExecutionOutcome(event, profitPercent) {
    if (event === 'tp1_reached')
        return { result: 'WIN', tpHit: 1, closeReason: 'tp1_reached' };
    if (event === 'tp2_reached')
        return { result: 'WIN', tpHit: 2, closeReason: 'tp2_reached' };
    if (event === 'time_exit')
        return { result: 'EXPIRED', tpHit: null, closeReason: 'time_exit' };
    if (event === 'stop_hit' ||
        event === 'entry_missed' ||
        event === 'invalidated' ||
        event === 'breakout_failed' ||
        event === 'closed') {
        if (profitPercent != null && Math.abs(profitPercent) <= BREAKEVEN_ABS_PCT) {
            return { result: 'BREAKEVEN', tpHit: null, closeReason: event };
        }
        if (event === 'stop_hit') {
            return { result: 'LOSS', tpHit: null, closeReason: 'stop_hit' };
        }
        return { result: 'LOSS', tpHit: null, closeReason: event };
    }
    return null;
}
async function checkTradeIdea(idea) {
    const quote = await (0, providers_1.getQuoteWithFailover)(idea.ticker, idea.market_type);
    if (!quote || quote.price <= 0) {
        log.warn(`Could not get valid quote for ${idea.ticker} (id: ${idea.id})`);
        return { event: null, currentPrice: 0, tradeId: idea.id };
    }
    const price = quote.price;
    // Time-based exit check (applies to all statuses)
    const age = (0, time_1.hoursSince)(idea.created_at);
    if (age > config_1.config.risk.maxTradeAgeHours) {
        log.info(`Time exit for ${idea.ticker}: idea is ${(0, indicators_1.round2)(age)}h old`);
        return { event: 'time_exit', currentPrice: price, tradeId: idea.id };
    }
    const entryLow = idea.entry_zone_low ?? idea.entry_price ?? 0;
    const entryHigh = idea.entry_zone_high ?? idea.entry_price ?? 0;
    if (idea.status === 'pending') {
        // Check if price is within entry zone (with 0.5% tolerance above zone high)
        if (price >= entryLow * 0.999 && price <= entryHigh * 1.005) {
            return { event: 'entry_triggered', currentPrice: price, tradeId: idea.id };
        }
        // Entry missed: price moved more than 4% above the entry zone without triggering.
        // Using 4% instead of 3% to avoid prematurely closing ideas with volatile entries.
        if (price > entryHigh * 1.04) {
            return { event: 'entry_missed', currentPrice: price, tradeId: idea.id };
        }
        // Entry missed: price fell significantly below entry zone (breakdown, no recovery)
        if (price < entryLow * 0.96) {
            return { event: 'entry_missed', currentPrice: price, tradeId: idea.id };
        }
        return { event: null, currentPrice: price, tradeId: idea.id };
    }
    if (idea.status === 'active' || idea.status === 'tp1_reached') {
        // Stop loss (applies to both active and post-TP1)
        if (price <= idea.stop_loss) {
            log.info(`Stop hit for ${idea.ticker} at $${price} (stop: $${idea.stop_loss})`);
            return { event: 'stop_hit', currentPrice: price, tradeId: idea.id };
        }
        // TP2 reached → full trade closed
        if (idea.take_profit_2 && price >= idea.take_profit_2) {
            return { event: 'tp2_reached', currentPrice: price, tradeId: idea.id };
        }
        // TP1 reached → partial profit, move stop to break-even
        if (idea.status === 'active' && price >= idea.take_profit_1) {
            return { event: 'tp1_reached', currentPrice: price, tradeId: idea.id };
        }
        // Breakout strategy invalidation: price fell back below resistance
        if (idea.strategy_slug === 'breakout_volume' &&
            idea.entry_zone_low &&
            price < idea.entry_zone_low * 0.995 // 0.5% buffer below resistance
        ) {
            return { event: 'breakout_failed', currentPrice: price, tradeId: idea.id };
        }
    }
    return { event: null, currentPrice: price, tradeId: idea.id };
}
async function applyTrackingEvent(idea, event, price, sendUpdate) {
    // Re-fetch idea from DB to guard against duplicate event firing
    // (e.g. two tracker ticks running concurrently on the same idea)
    const db = (0, client_1.getDbClient)();
    const { data: freshIdea } = await db
        .from('trade_ideas')
        .select('status')
        .eq('id', idea.id)
        .maybeSingle();
    if (!freshIdea)
        return;
    // Prevent applying an event that no longer makes sense given the current DB state
    const isClosed = ['tp2_reached', 'stopped', 'invalidated', 'expired', 'closed'].includes(freshIdea.status);
    if (isClosed) {
        log.debug(`Skipping ${event} for ${idea.ticker} — already closed (status: ${freshIdea.status})`);
        return;
    }
    const statusMap = {
        entry_triggered: 'active',
        entry_missed: 'closed',
        tp1_reached: 'tp1_reached',
        tp2_reached: 'tp2_reached',
        stop_hit: 'stopped',
        invalidated: 'invalidated',
        breakout_failed: 'invalidated',
        time_exit: 'expired',
        closed: 'closed',
    };
    const newStatus = statusMap[event] ?? freshIdea.status;
    const exitEvents = [
        'entry_missed', 'tp2_reached', 'stop_hit', 'invalidated',
        'breakout_failed', 'time_exit', 'closed',
    ];
    const isClose = exitEvents.includes(event);
    // After TP1 is reached, move stop loss to entry price (break-even) atomically
    // with the status update. This prevents a scenario where status is tp1_reached
    // but the original wide stop is still active (two separate calls could fail midway).
    const breakEvenStop = event === 'tp1_reached' && idea.entry_price != null
        ? (0, indicators_1.round2)(idea.entry_price)
        : undefined;
    if (breakEvenStop !== undefined) {
        log.info(`${idea.ticker}: Stop moving to break-even at $${breakEvenStop} after TP1`);
    }
    await (0, queries_1.updateTradeIdeaStatus)(idea.id, newStatus, {
        exit_reason: isClose ? event : undefined,
        stop_loss: breakEvenStop,
    });
    await (0, queries_1.insertTradeUpdate)({
        trade_idea_id: idea.id,
        update_type: event,
        message: buildUpdateMessage(event, price, idea),
        price_at_update: price,
    });
    const outcome = mapExecutionOutcome(event, computeProfitPercent(idea, price));
    if (outcome) {
        const closeStatuses = new Set(['tp2_reached', 'stop_hit', 'entry_missed', 'invalidated', 'breakout_failed', 'time_exit', 'closed']);
        const closedAt = closeStatuses.has(event) ? new Date().toISOString() : null;
        const profitPercent = computeProfitPercent(idea, price);
        const durationMinutes = closedAt ? computeDurationMinutes(idea.created_at, closedAt) : null;
        await (0, queries_1.createSignalExecutionOutcome)({
            signal_id: idea.id,
            ticker: idea.ticker,
            strategy_slug: idea.strategy_slug,
            timeframe: idea.timeframe,
            direction: normalizeDirection(idea.direction),
            entry_price: idea.entry_price,
            exit_price: price,
            result: outcome.result,
            profit_percent: profitPercent,
            duration_minutes: durationMinutes,
            close_reason: outcome.closeReason,
            tp_hit: outcome.tpHit,
            closed_at: closedAt,
            metadata: {
                event,
                priorStatus: idea.status,
            },
        });
    }
    // Persist signal performance for adaptive learning
    if (isClose) {
        await persistSignalPerformance(idea, event, price);
    }
    await sendUpdate(idea, event, price);
}
function buildUpdateMessage(event, price, idea) {
    const msgs = {
        entry_triggered: `Entry triggered at $${price} for ${idea.ticker}`,
        entry_missed: `Entry missed for ${idea.ticker}. Price moved to $${price} without triggering the entry zone.`,
        tp1_reached: `TP1 reached at $${price} for ${idea.ticker}. Stop moved to break-even ($${idea.entry_price}).`,
        tp2_reached: `TP2 reached at $${price} for ${idea.ticker}. Full target achieved.`,
        stop_hit: `Stop loss hit at $${price} for ${idea.ticker}.`,
        invalidated: `Setup invalidated at $${price} for ${idea.ticker}.`,
        breakout_failed: `Breakout failed for ${idea.ticker}. Price fell back to $${price}.`,
        time_exit: `Time-based exit triggered for ${idea.ticker} after ${config_1.config.risk.maxTradeAgeHours}h.`,
        trailing_stop_activated: `Trailing stop activated for ${idea.ticker} at $${price}.`,
        closed: `Trade idea closed for ${idea.ticker}.`,
    };
    return msgs[event] ?? `Update for ${idea.ticker}`;
}
async function persistSignalPerformance(idea, event, exitPrice) {
    try {
        const entryPrice = idea.entry_price || 0;
        const stopLoss = idea.stop_loss;
        const takeProfit = idea.take_profit_1;
        // Calculate outcome
        let outcome = 'breakeven';
        let winLoss = false;
        if (event === 'tp1_reached' || event === 'tp2_reached') {
            outcome = 'win';
            winLoss = true;
        }
        else if (event === 'stop_hit') {
            outcome = 'loss';
            winLoss = false;
        }
        else if (event === 'entry_missed') {
            outcome = 'entry_missed';
            winLoss = false;
        }
        else {
            outcome = 'other';
            winLoss = false;
        }
        // Calculate duration
        const durationHours = idea.created_at ? (0, time_1.hoursSince)(idea.created_at) : 0;
        const performanceData = {
            trade_idea_id: idea.id,
            strategy: idea.strategy_slug,
            symbol: idea.ticker,
            timeframe: idea.timeframe,
            market_regime: idea.market_condition || null,
            market_type: idea.market_type,
            exchange: idea.exchange,
            entry: entryPrice,
            stop_loss: stopLoss,
            take_profit: takeProfit || null,
            outcome,
            win_loss: winLoss,
            max_favorable_excursion: null,
            max_adverse_excursion: null,
            duration_hours: durationHours,
            ai_decision: idea.ai_decision || null,
            ai_confidence: idea.ai_confidence || null,
            fakeout_confidence: null,
            btc_bias: null,
            relative_volume: null,
            volatility_level: null,
        };
        await (0, queries_1.insertSignalPerformance)(performanceData);
        log.info('[SIGNAL_PERFORMANCE]', {
            tradeId: idea.id,
            symbol: idea.ticker,
            strategy: idea.strategy_slug,
            outcome,
            winLoss,
            durationHours: durationHours.toFixed(2),
            marketRegime: idea.market_condition,
        });
    }
    catch (err) {
        log.error('Failed to persist signal performance', {
            tradeId: idea.id,
            symbol: idea.ticker,
            event,
            err: err.message,
        });
    }
}
