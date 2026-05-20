"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveStocks = getActiveStocks;
exports.getRegisteredStrategySlugs = getRegisteredStrategySlugs;
exports.hasRecentSignalFingerprint = hasRecentSignalFingerprint;
exports.upsertSignalFingerprintCache = upsertSignalFingerprintCache;
exports.createSignalAuditEntry = createSignalAuditEntry;
exports.createSignalExecutionOutcome = createSignalExecutionOutcome;
exports.getStrategyLearningConfidenceModifier = getStrategyLearningConfidenceModifier;
exports.getStrategyLearningModifierSource = getStrategyLearningModifierSource;
exports.getContextLearningModifierSource = getContextLearningModifierSource;
exports.getMarketRegimeLearningModifierSource = getMarketRegimeLearningModifierSource;
exports.insertTradeIdea = insertTradeIdea;
exports.getActiveTradeIdeas = getActiveTradeIdeas;
exports.getRecentTradeIdeas = getRecentTradeIdeas;
exports.getTradeIdeaById = getTradeIdeaById;
exports.updateTradeIdeaStatus = updateTradeIdeaStatus;
exports.updateTradeIdeaTelegramId = updateTradeIdeaTelegramId;
exports.insertSignalPerformance = insertSignalPerformance;
exports.getAllSignalPerformances = getAllSignalPerformances;
exports.getSignalExecutionOutcomes = getSignalExecutionOutcomes;
exports.getRecentSignalPerformances = getRecentSignalPerformances;
exports.getRecentSignalPerformanceBySymbol = getRecentSignalPerformanceBySymbol;
exports.countTodayTradeIdeas = countTodayTradeIdeas;
exports.countTodayTradeIdeasByMarketType = countTodayTradeIdeasByMarketType;
exports.hasActiveIdeaForTicker = hasActiveIdeaForTicker;
exports.getWatchCandidatesByMarketType = getWatchCandidatesByMarketType;
exports.insertTradeUpdate = insertTradeUpdate;
exports.getTradeUpdates = getTradeUpdates;
exports.getDefaultPaperAccount = getDefaultPaperAccount;
exports.updatePaperAccount = updatePaperAccount;
exports.getOpenPaperPositions = getOpenPaperPositions;
exports.getRecentPaperPositions = getRecentPaperPositions;
exports.insertPaperPosition = insertPaperPosition;
exports.updatePaperPosition = updatePaperPosition;
exports.insertPaperFill = insertPaperFill;
exports.insertPaperEquitySnapshot = insertPaperEquitySnapshot;
exports.getPaperEquitySnapshots = getPaperEquitySnapshots;
exports.insertLog = insertLog;
exports.getSetting = getSetting;
exports.getAllSettings = getAllSettings;
const client_1 = require("./client");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('database');
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function round(value, digits = 2) {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}
function getConfidenceWeightFromTrades(trades) {
    if (trades < 5)
        return 0.10;
    if (trades <= 10)
        return 0.25;
    if (trades < 20)
        return 0.50;
    if (trades < 50)
        return 0.75;
    return 1.0;
}
function getRecencyWeightFromDays(daysSinceUpdate) {
    if (daysSinceUpdate <= 7)
        return 1.0;
    if (daysSinceUpdate <= 14)
        return 0.9;
    if (daysSinceUpdate <= 30)
        return 0.75;
    if (daysSinceUpdate <= 60)
        return 0.5;
    if (daysSinceUpdate <= 90)
        return 0.25;
    return 0.1;
}
function getDaysSinceIsoTimestamp(lastUpdated) {
    if (!lastUpdated)
        return null;
    const parsed = Date.parse(lastUpdated);
    if (!Number.isFinite(parsed))
        return null;
    const diffMs = Date.now() - parsed;
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    return Math.max(0, days);
}
function getEffectiveModifier(rawModifier, trades, lastUpdated) {
    const hasTrades = trades != null && Number.isFinite(trades) && trades > 0;
    const confidenceWeight = hasTrades ? getConfidenceWeightFromTrades(trades) : 1.0;
    const daysSinceUpdate = getDaysSinceIsoTimestamp(lastUpdated);
    const recencyWeight = daysSinceUpdate == null ? 1.0 : getRecencyWeightFromDays(daysSinceUpdate);
    const sampleWeightedModifier = rawModifier * confidenceWeight;
    const effectiveModifier = Math.round(rawModifier * confidenceWeight * recencyWeight);
    return { confidenceWeight, recencyWeight, sampleWeightedModifier, effectiveModifier, daysSinceUpdate };
}
function normalizeDirection(direction) {
    const value = String(direction || '').toUpperCase();
    return value === 'SHORT' || value === 'SELL' ? 'SHORT' : 'LONG';
}
function normalizeSession(session) {
    if (typeof session !== 'string')
        return 'unknown';
    const cleaned = session.trim();
    return cleaned.length > 0 ? cleaned : 'unknown';
}
function extractSessionFromMetadata(metadata) {
    if (!metadata)
        return 'unknown';
    const session = metadata.session ?? metadata.marketSession ?? metadata.market_session;
    return normalizeSession(session);
}
function normalizeMarketRegime(value) {
    if (typeof value !== 'string')
        return 'unknown';
    const cleaned = value.trim();
    return cleaned.length > 0 ? cleaned : 'unknown';
}
function extractMarketRegimeFromMetadata(metadata) {
    if (!metadata)
        return 'unknown';
    const regime = metadata.market_condition ?? metadata.marketCondition ?? metadata.market_regime ?? metadata.marketRegime;
    return normalizeMarketRegime(regime);
}
function extractSessionFromTradeIdeaRow(row) {
    if (!row || !row.crypto_metadata || typeof row.crypto_metadata !== 'object')
        return 'unknown';
    return extractSessionFromMetadata(row.crypto_metadata);
}
function computeContextConfidenceModifier(winRate) {
    if (winRate > 75)
        return 6;
    if (winRate > 65)
        return 4;
    if (winRate < 35)
        return -7;
    if (winRate < 45)
        return -4;
    return 0;
}
function computeContextPositionSizeModifier(winRate) {
    if (winRate > 75)
        return 1.2;
    if (winRate < 40)
        return 0.7;
    return 1;
}
async function refreshStrategyLearning(strategySlug) {
    const db = (0, client_1.getDbClient)();
    const existingRes = await db
        .from('strategy_learning')
        .select('*')
        .eq('strategy_slug', strategySlug)
        .maybeSingle();
    const existing = (existingRes.data ?? null);
    const oldModifier = typeof existing?.confidence_modifier === 'number' ? existing.confidence_modifier : 0;
    const oldSizeModifier = typeof existing?.position_size_modifier === 'number' ? existing.position_size_modifier : 1;
    const outcomesRes = await db
        .from('signal_execution_outcomes')
        .select('result, profit_percent')
        .eq('strategy_slug', strategySlug)
        .in('result', ['WIN', 'LOSS', 'BREAKEVEN', 'EXPIRED']);
    if (outcomesRes.error) {
        log.error('Failed to fetch outcomes for strategy learning refresh', {
            error: outcomesRes.error.message,
            strategy: strategySlug,
        });
        return;
    }
    const rows = outcomesRes.data ?? [];
    const trades = rows.length;
    const wins = rows.filter((row) => row.result === 'WIN').length;
    const losses = rows.filter((row) => row.result === 'LOSS').length;
    const winRate = trades > 0 ? round((wins / trades) * 100, 2) : 0;
    const avgProfit = trades > 0
        ? round(rows.reduce((sum, row) => sum + (typeof row.profit_percent === 'number' ? row.profit_percent : 0), 0) / trades, 4)
        : 0;
    let newModifier = oldModifier;
    const reasons = [];
    if (trades >= 10 && winRate > 70) {
        newModifier = clamp(oldModifier + 2, -10, 10);
        reasons.push('winRateAbove70');
    }
    else if (trades >= 10 && winRate < 45) {
        newModifier = clamp(oldModifier - 3, -10, 10);
        reasons.push('winRateBelow45');
    }
    let newPositionSizeModifier = oldSizeModifier;
    if (avgProfit < 0) {
        newPositionSizeModifier = round(oldSizeModifier - 0.1, 3);
        reasons.push('avgProfitBelowZero');
    }
    const upsertRes = await db
        .from('strategy_learning')
        .upsert({
        strategy_slug: strategySlug,
        trades,
        wins,
        losses,
        win_rate: winRate,
        avg_profit: avgProfit,
        confidence_modifier: newModifier,
        position_size_modifier: newPositionSizeModifier,
        last_updated: new Date().toISOString(),
    }, { onConflict: 'strategy_slug' });
    if (upsertRes.error) {
        log.error('Failed to upsert strategy learning', {
            error: upsertRes.error.message,
            strategy: strategySlug,
        });
        return;
    }
    log.info('[REINFORCEMENT_UPDATE]', {
        strategy: strategySlug,
        oldModifier,
        newModifier,
        reason: reasons.length > 0 ? reasons.join('+') : 'noRuleTriggered',
        trades,
        winRate,
        avgProfit,
        oldPositionSizeModifier: oldSizeModifier,
        newPositionSizeModifier,
    });
}
async function refreshContextLearning(key) {
    const db = (0, client_1.getDbClient)();
    const outcomesRes = await db
        .from('signal_execution_outcomes')
        .select('result, profit_percent, metadata')
        .eq('strategy_slug', key.strategy_slug)
        .eq('ticker', key.ticker)
        .eq('timeframe', key.timeframe)
        .eq('direction', key.direction)
        .in('result', ['WIN', 'LOSS']);
    if (outcomesRes.error) {
        log.error('Failed to fetch outcomes for context learning refresh', {
            error: outcomesRes.error.message,
            strategy: key.strategy_slug,
            ticker: key.ticker,
            timeframe: key.timeframe,
            session: key.session,
            direction: key.direction,
        });
        return;
    }
    const matchedRows = (outcomesRes.data ?? []).filter((row) => {
        const metadata = (row.metadata ?? {});
        return extractSessionFromMetadata(metadata) === key.session;
    });
    const trades = matchedRows.length;
    const wins = matchedRows.filter((row) => row.result === 'WIN').length;
    const losses = matchedRows.filter((row) => row.result === 'LOSS').length;
    const winRate = trades > 0 ? round((wins / trades) * 100, 2) : 0;
    const avgProfit = trades > 0
        ? round(matchedRows.reduce((sum, row) => sum + (typeof row.profit_percent === 'number' ? row.profit_percent : 0), 0) / trades, 4)
        : 0;
    const confidenceModifier = computeContextConfidenceModifier(winRate);
    const positionSizeModifier = computeContextPositionSizeModifier(winRate);
    const upsertRes = await db
        .from('context_learning')
        .upsert({
        strategy_slug: key.strategy_slug,
        ticker: key.ticker,
        timeframe: key.timeframe,
        session: key.session,
        direction: key.direction,
        trades,
        wins,
        losses,
        win_rate: winRate,
        avg_profit: avgProfit,
        confidence_modifier: confidenceModifier,
        position_size_modifier: positionSizeModifier,
        last_updated: new Date().toISOString(),
    }, { onConflict: 'strategy_slug,ticker,timeframe,session,direction' });
    if (upsertRes.error) {
        log.error('Failed to upsert context learning', {
            error: upsertRes.error.message,
            strategy: key.strategy_slug,
            ticker: key.ticker,
            timeframe: key.timeframe,
            session: key.session,
            direction: key.direction,
        });
        return;
    }
    log.info('[CONTEXT_LEARNING_UPDATE]', {
        strategy: key.strategy_slug,
        ticker: key.ticker,
        timeframe: key.timeframe,
        session: key.session,
        direction: key.direction,
        trades,
        wins,
        losses,
        winRate,
        modifier: confidenceModifier,
    });
}
async function refreshMarketRegimeLearning(key) {
    const db = (0, client_1.getDbClient)();
    const outcomesRes = await db
        .from('signal_execution_outcomes')
        .select('signal_id, result, profit_percent, metadata')
        .eq('strategy_slug', key.strategy_slug)
        .eq('ticker', key.ticker)
        .eq('timeframe', key.timeframe)
        .eq('direction', key.direction)
        .in('result', ['WIN', 'LOSS']);
    if (outcomesRes.error) {
        log.error('Failed to fetch outcomes for market regime learning refresh', {
            error: outcomesRes.error.message,
            strategy: key.strategy_slug,
            ticker: key.ticker,
            timeframe: key.timeframe,
            session: key.session,
            direction: key.direction,
            marketRegime: key.market_regime,
        });
        return;
    }
    const outcomeRows = outcomesRes.data ?? [];
    const signalIds = outcomeRows.map((row) => row.signal_id).filter((id) => typeof id === 'string' && id.length > 0);
    const tradeIdeasById = new Map();
    if (signalIds.length > 0) {
        const ideasRes = await db
            .from('trade_ideas')
            .select('id, ticker, market_condition, crypto_metadata')
            .in('id', signalIds);
        if (ideasRes.error) {
            log.error('Failed to fetch trade ideas for market regime learning refresh', {
                error: ideasRes.error.message,
                strategy: key.strategy_slug,
                timeframe: key.timeframe,
                direction: key.direction,
            });
            return;
        }
        for (const row of ideasRes.data ?? []) {
            if (typeof row.id === 'string' && row.id.length > 0) {
                tradeIdeasById.set(row.id, {
                    ticker: typeof row.ticker === 'string' ? row.ticker : '',
                    market_condition: typeof row.market_condition === 'string' ? row.market_condition : null,
                    crypto_metadata: (row.crypto_metadata ?? null),
                });
            }
        }
    }
    const matchedRows = outcomeRows.filter((row) => {
        const metadata = (row.metadata ?? {});
        const idea = tradeIdeasById.get(row.signal_id);
        const metadataMarketRegime = extractMarketRegimeFromMetadata(metadata);
        const rowMarketRegime = normalizeMarketRegime(metadataMarketRegime !== 'unknown'
            ? metadataMarketRegime
            : (idea?.market_condition ?? 'unknown'));
        const metadataSession = extractSessionFromMetadata(metadata);
        const rowSession = metadataSession !== 'unknown'
            ? metadataSession
            : extractSessionFromTradeIdeaRow(idea ? { crypto_metadata: idea.crypto_metadata } : null);
        const tickerMatches = key.ticker == null ? true : (idea?.ticker === key.ticker);
        return rowMarketRegime === key.market_regime && rowSession === key.session && tickerMatches;
    });
    const trades = matchedRows.length;
    const wins = matchedRows.filter((row) => row.result === 'WIN').length;
    const losses = matchedRows.filter((row) => row.result === 'LOSS').length;
    const winRate = trades > 0 ? round((wins / trades) * 100, 2) : 0;
    const avgProfit = trades > 0
        ? round(matchedRows.reduce((sum, row) => sum + (typeof row.profit_percent === 'number' ? row.profit_percent : 0), 0) / trades, 4)
        : 0;
    const existingRes = await db
        .from('market_regime_learning')
        .select('confidence_modifier')
        .eq('strategy_slug', key.strategy_slug)
        .eq('timeframe', key.timeframe)
        .eq('direction', key.direction)
        .eq('market_regime', key.market_regime)
        .eq('session', key.session)
        .eq('ticker', key.ticker)
        .maybeSingle();
    const oldModifier = typeof existingRes.data?.confidence_modifier === 'number' ? existingRes.data.confidence_modifier : 0;
    let confidenceModifier = oldModifier;
    if (winRate > 70)
        confidenceModifier = clamp(oldModifier + 1, -15, 15);
    else if (winRate < 40)
        confidenceModifier = clamp(oldModifier - 1, -15, 15);
    const positionSizeModifier = computeContextPositionSizeModifier(winRate);
    const upsertRes = await db
        .from('market_regime_learning')
        .upsert({
        strategy_slug: key.strategy_slug,
        ticker: key.ticker,
        timeframe: key.timeframe,
        direction: key.direction,
        market_regime: key.market_regime,
        session: key.session,
        trades,
        wins,
        losses,
        win_rate: winRate,
        avg_profit: avgProfit,
        confidence_modifier: confidenceModifier,
        position_size_modifier: positionSizeModifier,
        last_updated: new Date().toISOString(),
    }, { onConflict: 'strategy_slug,ticker,timeframe,direction,market_regime,session' });
    if (upsertRes.error) {
        log.error('Failed to upsert market regime learning', {
            error: upsertRes.error.message,
            strategy: key.strategy_slug,
            ticker: key.ticker,
            timeframe: key.timeframe,
            direction: key.direction,
            marketRegime: key.market_regime,
            session: key.session,
        });
        return;
    }
    log.info('[MARKET_REGIME_LEARNING_UPDATE]', {
        strategy: key.strategy_slug,
        ticker: key.ticker,
        timeframe: key.timeframe,
        direction: key.direction,
        marketRegime: key.market_regime,
        session: key.session,
        trades,
        wins,
        losses,
        winRate,
        oldModifier,
        modifier: confidenceModifier,
    });
}
// ============================================================
// STOCK QUERIES
// ============================================================
async function getActiveStocks() {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('stocks')
        .select('*')
        .eq('active', true)
        .order('ticker');
    if (error) {
        log.error('Failed to fetch active stocks', { error: error.message });
        return [];
    }
    return data ?? [];
}
async function getRegisteredStrategySlugs() {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('strategies')
        .select('slug');
    if (error) {
        log.error('Failed to fetch registered strategy slugs', { error: error.message });
        return [];
    }
    return (data ?? [])
        .map((row) => row.slug)
        .filter(Boolean);
}
async function hasRecentSignalFingerprint(fingerprint) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('signal_delivery_cache')
        .select('fingerprint, expires_at')
        .eq('fingerprint', fingerprint)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
    if (error) {
        log.error('Failed to check signal delivery cache', { error: error.message, fingerprint });
        return false;
    }
    return !!data;
}
async function upsertSignalFingerprintCache(fingerprint, payload, ttlSeconds = 3600) {
    const db = (0, client_1.getDbClient)();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const { error } = await db
        .from('signal_delivery_cache')
        .upsert({
        fingerprint,
        ...payload,
        expires_at: expiresAt,
    }, { onConflict: 'fingerprint' });
    if (error) {
        log.error('Failed to upsert signal delivery cache', {
            error: error.message,
            fingerprint,
            symbol: payload.symbol,
            strategy: payload.strategy_slug,
        });
    }
}
async function createSignalAuditEntry(payload) {
    const db = (0, client_1.getDbClient)();
    const { error } = await db
        .from('signal_audit_log')
        .insert({
        signal_id: payload.signal_id,
        fingerprint: payload.fingerprint,
        ticker: payload.ticker,
        strategy_slug: payload.strategy_slug,
        timeframe: payload.timeframe,
        direction: payload.direction,
        telegram_message_id: payload.telegram_message_id,
        event_type: payload.event_type,
        skipped_reason: payload.skipped_reason,
        metadata: payload.metadata ?? {},
    });
    if (error) {
        log.error('Failed to insert signal audit log entry', {
            error: error.message,
            ticker: payload.ticker,
            strategy: payload.strategy_slug,
            eventType: payload.event_type,
            fingerprint: payload.fingerprint,
        });
    }
}
async function createSignalExecutionOutcome(payload) {
    const db = (0, client_1.getDbClient)();
    const { error } = await db
        .from('signal_execution_outcomes')
        .insert({
        signal_id: payload.signal_id,
        ticker: payload.ticker,
        strategy_slug: payload.strategy_slug,
        timeframe: payload.timeframe,
        direction: payload.direction,
        entry_price: payload.entry_price,
        exit_price: payload.exit_price,
        result: payload.result,
        profit_percent: payload.profit_percent,
        duration_minutes: payload.duration_minutes,
        close_reason: payload.close_reason,
        tp_hit: payload.tp_hit,
        closed_at: payload.closed_at,
        metadata: payload.metadata ?? {},
    });
    log.info('[TRADE_OUTCOME]', {
        ticker: payload.ticker,
        strategy: payload.strategy_slug,
        result: payload.result,
        profitPercent: payload.profit_percent,
        durationMinutes: payload.duration_minutes,
        tpHit: payload.tp_hit,
        signalId: payload.signal_id,
    });
    if (error) {
        log.error('Failed to insert signal execution outcome', {
            error: error.message,
            signalId: payload.signal_id,
            ticker: payload.ticker,
            strategy: payload.strategy_slug,
            result: payload.result,
        });
        return;
    }
    if (payload.result !== 'WIN' && payload.result !== 'LOSS') {
        log.info('[REINFORCEMENT_SKIP_OPEN_OUTCOME]', {
            strategy: payload.strategy_slug,
            result: payload.result ?? null,
            signalId: payload.signal_id,
            reason: 'Outcome is not WIN/LOSS',
        });
        return;
    }
    await refreshStrategyLearning(payload.strategy_slug);
    const contextKey = {
        strategy_slug: payload.strategy_slug,
        ticker: payload.ticker,
        timeframe: payload.timeframe,
        session: extractSessionFromMetadata(payload.metadata),
        direction: normalizeDirection(payload.direction),
    };
    await refreshContextLearning(contextKey);
    const marketRegimeKey = {
        strategy_slug: payload.strategy_slug,
        ticker: payload.ticker,
        timeframe: payload.timeframe,
        direction: normalizeDirection(payload.direction),
        market_regime: extractMarketRegimeFromMetadata(payload.metadata),
        session: extractSessionFromMetadata(payload.metadata),
    };
    await refreshMarketRegimeLearning(marketRegimeKey);
}
async function getStrategyLearningConfidenceModifier(strategySlug) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('strategy_learning')
        .select('confidence_modifier')
        .eq('strategy_slug', strategySlug)
        .maybeSingle();
    if (error) {
        log.warn('Failed to fetch strategy learning confidence modifier', {
            error: error.message,
            strategy: strategySlug,
        });
        return 0;
    }
    return typeof data?.confidence_modifier === 'number' ? data.confidence_modifier : 0;
}
async function getStrategyLearningModifierSource(strategySlug) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('strategy_learning')
        .select('confidence_modifier, trades, win_rate, last_updated')
        .eq('strategy_slug', strategySlug)
        .maybeSingle();
    if (error) {
        log.warn('Failed to fetch strategy learning source', {
            error: error.message,
            strategy: strategySlug,
        });
        return {
            source: 'fallback',
            strategyRowFound: false,
            trades: null,
            winRate: null,
            daysSinceUpdate: null,
            modifier: 0,
            rawModifier: 0,
            confidenceWeight: 1,
            recencyWeight: 1,
            sampleWeightedModifier: 0,
            effectiveModifier: 0,
        };
    }
    if (!data) {
        return {
            source: 'fallback',
            strategyRowFound: false,
            trades: null,
            winRate: null,
            daysSinceUpdate: null,
            modifier: 0,
            rawModifier: 0,
            confidenceWeight: 1,
            recencyWeight: 1,
            sampleWeightedModifier: 0,
            effectiveModifier: 0,
        };
    }
    const rawModifier = typeof data.confidence_modifier === 'number' ? data.confidence_modifier : 0;
    const trades = typeof data.trades === 'number' ? data.trades : null;
    const winRate = typeof data.win_rate === 'number' ? data.win_rate : null;
    const lastUpdated = typeof data.last_updated === 'string'
        ? data.last_updated
        : null;
    const weighted = getEffectiveModifier(rawModifier, trades, lastUpdated);
    return {
        source: 'strategy_learning',
        strategyRowFound: true,
        trades,
        winRate,
        daysSinceUpdate: weighted.daysSinceUpdate,
        modifier: rawModifier,
        rawModifier,
        confidenceWeight: weighted.confidenceWeight,
        recencyWeight: weighted.recencyWeight,
        sampleWeightedModifier: weighted.sampleWeightedModifier,
        effectiveModifier: weighted.effectiveModifier,
    };
}
async function getContextLearningModifierSource(key) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('context_learning')
        .select('confidence_modifier, trades, win_rate, last_updated')
        .eq('strategy_slug', key.strategy_slug)
        .eq('ticker', key.ticker)
        .eq('timeframe', key.timeframe)
        .eq('session', key.session)
        .eq('direction', key.direction)
        .maybeSingle();
    if (error) {
        log.warn('Failed to fetch context learning source', {
            error: error.message,
            strategy: key.strategy_slug,
            ticker: key.ticker,
            timeframe: key.timeframe,
            session: key.session,
            direction: key.direction,
        });
        return {
            source: 'fallback',
            strategyRowFound: false,
            trades: null,
            winRate: null,
            daysSinceUpdate: null,
            modifier: 0,
            rawModifier: 0,
            confidenceWeight: 1,
            recencyWeight: 1,
            sampleWeightedModifier: 0,
            effectiveModifier: 0,
        };
    }
    if (!data) {
        return {
            source: 'fallback',
            strategyRowFound: false,
            trades: null,
            winRate: null,
            daysSinceUpdate: null,
            modifier: 0,
            rawModifier: 0,
            confidenceWeight: 1,
            recencyWeight: 1,
            sampleWeightedModifier: 0,
            effectiveModifier: 0,
        };
    }
    const rawModifier = typeof data.confidence_modifier === 'number' ? data.confidence_modifier : 0;
    const trades = typeof data.trades === 'number' ? data.trades : null;
    const winRate = typeof data.win_rate === 'number' ? data.win_rate : null;
    const lastUpdated = typeof data.last_updated === 'string' ? data.last_updated : null;
    const weighted = getEffectiveModifier(rawModifier, trades, lastUpdated);
    return {
        source: 'context_learning',
        strategyRowFound: true,
        trades,
        winRate,
        daysSinceUpdate: weighted.daysSinceUpdate,
        modifier: rawModifier,
        rawModifier,
        confidenceWeight: weighted.confidenceWeight,
        recencyWeight: weighted.recencyWeight,
        sampleWeightedModifier: weighted.sampleWeightedModifier,
        effectiveModifier: weighted.effectiveModifier,
    };
}
async function getMarketRegimeLearningModifierSource(key) {
    const db = (0, client_1.getDbClient)();
    const query = db
        .from('market_regime_learning')
        .select('confidence_modifier, trades, win_rate, last_updated')
        .eq('strategy_slug', key.strategy_slug)
        .eq('timeframe', key.timeframe)
        .eq('direction', key.direction)
        .eq('market_regime', key.market_regime)
        .eq('session', key.session);
    const tickerScopedQuery = key.ticker == null ? query.is('ticker', null) : query.eq('ticker', key.ticker);
    const { data, error } = await tickerScopedQuery.maybeSingle();
    if (error) {
        log.warn('Failed to fetch market regime learning source', {
            error: error.message,
            strategy: key.strategy_slug,
            ticker: key.ticker,
            timeframe: key.timeframe,
            direction: key.direction,
            marketRegime: key.market_regime,
            session: key.session,
        });
        return {
            source: 'fallback',
            strategyRowFound: false,
            trades: null,
            winRate: null,
            daysSinceUpdate: null,
            modifier: 0,
            rawModifier: 0,
            confidenceWeight: 1,
            recencyWeight: 1,
            sampleWeightedModifier: 0,
            effectiveModifier: 0,
        };
    }
    if (!data) {
        return {
            source: 'fallback',
            strategyRowFound: false,
            trades: null,
            winRate: null,
            daysSinceUpdate: null,
            modifier: 0,
            rawModifier: 0,
            confidenceWeight: 1,
            recencyWeight: 1,
            sampleWeightedModifier: 0,
            effectiveModifier: 0,
        };
    }
    const rawModifier = typeof data.confidence_modifier === 'number' ? data.confidence_modifier : 0;
    const trades = typeof data.trades === 'number' ? data.trades : null;
    const winRate = typeof data.win_rate === 'number' ? data.win_rate : null;
    const lastUpdated = typeof data.last_updated === 'string' ? data.last_updated : null;
    const weighted = getEffectiveModifier(rawModifier, trades, lastUpdated);
    return {
        source: 'market_regime_learning',
        strategyRowFound: true,
        trades,
        winRate,
        daysSinceUpdate: weighted.daysSinceUpdate,
        modifier: rawModifier,
        rawModifier,
        confidenceWeight: weighted.confidenceWeight,
        recencyWeight: weighted.recencyWeight,
        sampleWeightedModifier: weighted.sampleWeightedModifier,
        effectiveModifier: weighted.effectiveModifier,
    };
}
// ============================================================
// TRADE IDEA QUERIES
// ============================================================
async function insertTradeIdea(idea) {
    const db = (0, client_1.getDbClient)();
    const rawDirection = idea.direction;
    const normalizedDirection = rawDirection?.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';
    log.info('[DIRECTION_NORMALIZED]', {
        rawDirection,
        normalizedDirection,
    });
    const safeIdea = {
        ...idea,
        direction: normalizedDirection,
        reasons: idea.reasons ?? [],
        rejection_reasons: idea.rejection_reasons ?? [],
    };
    log.debug('[DB_INSERT]', { table: 'trade_ideas', ticker: safeIdea.ticker, keys: Object.keys(safeIdea) });
    const { data, error } = await db
        .from('trade_ideas')
        .insert(safeIdea)
        .select()
        .maybeSingle();
    if (error) {
        log.error('Failed to insert trade idea', {
            error: error.message,
            ticker: safeIdea.ticker,
            payloadKeys: Object.keys(safeIdea),
        });
        return null;
    }
    if (data) {
        await createSignalExecutionOutcome({
            signal_id: data.id,
            ticker: data.ticker,
            strategy_slug: data.strategy_slug,
            timeframe: data.timeframe,
            direction: data.direction,
            entry_price: data.entry_price,
            exit_price: null,
            result: 'OPEN',
            profit_percent: null,
            duration_minutes: null,
            close_reason: null,
            tp_hit: null,
            closed_at: null,
            metadata: { status: data.status },
        });
        log.info('[TRADE_IDEA_CREATED]', { symbol: data.ticker, strategy: data.strategy_slug, confidence: data.confidence_score });
    }
    return data;
}
async function getActiveTradeIdeas() {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('trade_ideas')
        .select('*')
        .in('status', ['pending', 'active', 'tp1_reached'])
        .order('created_at', { ascending: false });
    if (error) {
        log.error('Failed to fetch active trade ideas', { error: error.message });
        return [];
    }
    return data ?? [];
}
async function getRecentTradeIdeas(limit = 20) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('trade_ideas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        log.error('Failed to fetch recent trade ideas', { error: error.message });
        return [];
    }
    return data ?? [];
}
async function getTradeIdeaById(id) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('trade_ideas')
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error) {
        log.error('Failed to fetch trade idea by id', { id, error: error.message });
        return null;
    }
    return data ?? null;
}
async function updateTradeIdeaStatus(id, status, extra = {}) {
    const db = (0, client_1.getDbClient)();
    const closeStatuses = ['tp2_reached', 'stopped', 'invalidated', 'expired', 'closed'];
    const payload = {
        status,
        ...extra,
        // Always set closed_at when transitioning to a terminal state;
        // extra.closed_at is ignored to prevent caller clock drift issues
        ...(closeStatuses.includes(status) ? { closed_at: new Date().toISOString() } : {}),
    };
    const { error } = await db.from('trade_ideas').update(payload).eq('id', id);
    if (error) {
        log.error('Failed to update trade idea status', { error: error.message, id, status });
    }
}
async function updateTradeIdeaTelegramId(id, messageId) {
    const db = (0, client_1.getDbClient)();
    await db.from('trade_ideas').update({ telegram_message_id: messageId }).eq('id', id);
}
async function insertSignalPerformance(performance) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('signal_performance')
        .insert(performance)
        .select()
        .maybeSingle();
    if (error) {
        log.error('Failed to insert signal performance', { error: error.message, strategy: performance.strategy, symbol: performance.symbol });
        return null;
    }
    return data;
}
async function getAllSignalPerformances(limit = 1000) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('signal_performance')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        log.error('Failed to fetch signal performance records', { error: error.message });
        return [];
    }
    return data ?? [];
}
async function getSignalExecutionOutcomes(limit = 5000) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('signal_execution_outcomes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        log.error('Failed to fetch signal execution outcomes', { error: error.message });
        return [];
    }
    return (data ?? []);
}
async function getRecentSignalPerformances(strategy, limit = 50) {
    const db = (0, client_1.getDbClient)();
    const query = db
        .from('signal_performance')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (strategy !== 'all') {
        query.eq('strategy', strategy);
    }
    const { data, error } = await query;
    if (error) {
        log.error('Failed to fetch recent signal performance for strategy', { strategy, error: error.message });
        return [];
    }
    return data ?? [];
}
async function getRecentSignalPerformanceBySymbol(symbol, limit = 50) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('signal_performance')
        .select('*')
        .eq('symbol', symbol)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        log.error('Failed to fetch recent signal performance for symbol', { symbol, error: error.message });
        return [];
    }
    return data ?? [];
}
async function countTodayTradeIdeas() {
    const db = (0, client_1.getDbClient)();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count, error } = await db
        .from('trade_ideas')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());
    if (error)
        return 0;
    return count ?? 0;
}
async function countTodayTradeIdeasByMarketType(marketType) {
    const db = (0, client_1.getDbClient)();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const query = db
        .from('trade_ideas')
        .select('*', { count: 'exact', head: true })
        .eq('market_type', marketType)
        .gte('created_at', todayStart.toISOString());
    const { count, error } = await query;
    if (!error) {
        return count ?? 0;
    }
    if (error.message.includes('market_type')) {
        log.warn('market_type column missing in trade_ideas; falling back to daily count without market_type filter', {
            marketType,
            error: error.message,
        });
        const fallbackResult = await db
            .from('trade_ideas')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayStart.toISOString());
        if (fallbackResult.error) {
            log.error('Failed to count trade ideas fallback', { error: fallbackResult.error.message });
            return 0;
        }
        return fallbackResult.count ?? 0;
    }
    return 0;
}
async function hasActiveIdeaForTicker(ticker) {
    const db = (0, client_1.getDbClient)();
    const { count, error } = await db
        .from('trade_ideas')
        .select('*', { count: 'exact', head: true })
        .eq('ticker', ticker)
        .in('status', ['pending', 'active', 'tp1_reached']);
    if (error)
        return false;
    return (count ?? 0) > 0;
}
async function getWatchCandidatesByMarketType(marketType) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('trade_ideas')
        .select('*')
        .eq('status', 'watch')
        .eq('market_type', marketType)
        .order('created_at', { ascending: true });
    if (!error) {
        return data ?? [];
    }
    if (error.message.includes('market_type')) {
        log.warn('market_type column missing in trade_ideas; fetching watch candidates without market_type filter', {
            marketType,
            error: error.message,
        });
        const fallback = await db
            .from('trade_ideas')
            .select('*')
            .eq('status', 'watch')
            .order('created_at', { ascending: true });
        if (fallback.error) {
            log.error('Failed to fetch watch candidates fallback', { error: fallback.error.message });
            return [];
        }
        return (fallback.data ?? []).map((idea) => ({
            ...idea,
            market_type: idea.market_type ?? marketType,
        }));
    }
    log.error('Failed to fetch watch candidates', { error: error.message, marketType });
    return [];
}
// ============================================================
// TRADE IDEA UPDATES
// ============================================================
async function insertTradeUpdate(update) {
    const db = (0, client_1.getDbClient)();
    const { error } = await db.from('trade_idea_updates').insert(update);
    if (error) {
        log.error('Failed to insert trade update', { error: error.message });
    }
}
async function getTradeUpdates(tradeIdeaId) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('trade_idea_updates')
        .select('*')
        .eq('trade_idea_id', tradeIdeaId)
        .order('created_at', { ascending: true });
    if (error)
        return [];
    return data ?? [];
}
// ============================================================
// PAPER TRADING
// ============================================================
async function getDefaultPaperAccount() {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('paper_accounts')
        .select('*')
        .eq('account_name', 'default')
        .maybeSingle();
    if (error) {
        log.error('Failed to fetch default paper account', { error: error.message });
        return null;
    }
    return data ?? null;
}
async function updatePaperAccount(accountId, payload) {
    const db = (0, client_1.getDbClient)();
    const { error } = await db
        .from('paper_accounts')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', accountId);
    if (error) {
        log.error('Failed to update paper account', { error: error.message, accountId });
    }
}
async function getOpenPaperPositions(accountId) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('paper_positions')
        .select('*')
        .eq('account_id', accountId)
        .eq('status', 'open')
        .order('opened_at', { ascending: true });
    if (error) {
        log.error('Failed to fetch open paper positions', { error: error.message, accountId });
        return [];
    }
    return data ?? [];
}
async function getRecentPaperPositions(limit = 300) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('paper_positions')
        .select('*')
        .order('opened_at', { ascending: false })
        .limit(limit);
    if (error) {
        log.error('Failed to fetch recent paper positions', { error: error.message });
        return [];
    }
    return data ?? [];
}
async function insertPaperPosition(position) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('paper_positions')
        .insert(position)
        .select('*')
        .maybeSingle();
    if (error) {
        log.error('Failed to insert paper position', { error: error.message, symbol: position.symbol });
        return null;
    }
    return data;
}
async function updatePaperPosition(positionId, payload) {
    const db = (0, client_1.getDbClient)();
    const { error } = await db
        .from('paper_positions')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', positionId);
    if (error) {
        log.error('Failed to update paper position', { error: error.message, positionId });
    }
}
async function insertPaperFill(fill) {
    const db = (0, client_1.getDbClient)();
    const { error } = await db
        .from('paper_fills')
        .insert(fill);
    if (error) {
        log.error('Failed to insert paper fill', { error: error.message, positionId: fill.position_id });
    }
}
async function insertPaperEquitySnapshot(snapshot) {
    const db = (0, client_1.getDbClient)();
    const { error } = await db
        .from('paper_equity_snapshots')
        .insert(snapshot);
    if (error) {
        log.error('Failed to insert paper equity snapshot', { error: error.message, accountId: snapshot.account_id });
    }
}
async function getPaperEquitySnapshots(accountId, limit = 1000) {
    const db = (0, client_1.getDbClient)();
    const { data, error } = await db
        .from('paper_equity_snapshots')
        .select('*')
        .eq('account_id', accountId)
        .order('recorded_at', { ascending: true })
        .limit(limit);
    if (error) {
        log.error('Failed to fetch paper equity snapshots', { error: error.message, accountId });
        return [];
    }
    return data ?? [];
}
// ============================================================
// LOGS
// ============================================================
async function insertLog(level, component, message, metadata = {}) {
    const db = (0, client_1.getDbClient)();
    await db.from('logs').insert({ level, component, message, metadata });
}
// ============================================================
// SETTINGS
// ============================================================
async function getSetting(key) {
    const db = (0, client_1.getDbClient)();
    const { data } = await db
        .from('settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
    return data?.value ?? null;
}
async function getAllSettings() {
    const db = (0, client_1.getDbClient)();
    const { data } = await db.from('settings').select('key, value');
    if (!data)
        return {};
    return Object.fromEntries(data.map((r) => [r.key, r.value]));
}
