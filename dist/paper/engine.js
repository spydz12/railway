"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensurePaperPositionFromIdea = ensurePaperPositionFromIdea;
exports.updatePaperPortfolio = updatePaperPortfolio;
const queries_1 = require("../database/queries");
const logger_1 = require("../utils/logger");
const providers_1 = require("../providers");
const config_1 = require("../config");
const log = (0, logger_1.createComponentLogger)('paper:engine');
const BPS_DIVISOR = 10000;
function applySlippage(price, slippageBps, side, isEntry) {
    const slip = slippageBps / BPS_DIVISOR;
    if (side === 'LONG') {
        return isEntry ? price * (1 + slip) : price * (1 - slip);
    }
    return isEntry ? price * (1 - slip) : price * (1 + slip);
}
function calculateFee(notional, feeBps) {
    return notional * (feeBps / BPS_DIVISOR);
}
async function ensurePaperPositionFromIdea(idea) {
    if (!config_1.config.paper.mode)
        return;
    const account = await (0, queries_1.getDefaultPaperAccount)();
    if (!account)
        return;
    const openPositions = await (0, queries_1.getOpenPaperPositions)(account.id);
    const exists = openPositions.find((position) => position.trade_idea_id === idea.id);
    if (exists)
        return;
    const quote = await (0, providers_1.getQuoteWithFailover)(idea.ticker, idea.market_type);
    if (!quote || quote.price <= 0)
        return;
    const entryLow = idea.entry_zone_low ?? idea.entry_price ?? 0;
    const entryHigh = idea.entry_zone_high ?? idea.entry_price ?? 0;
    if (entryLow <= 0 || entryHigh <= 0)
        return;
    if (!(quote.price >= entryLow * 0.999 && quote.price <= entryHigh * 1.005)) {
        return;
    }
    const side = idea.direction === 'SHORT' || idea.direction === 'SELL' ? 'SHORT' : 'LONG';
    const slippageBps = 5;
    const feeBps = 10;
    const effectiveEntry = applySlippage(quote.price, slippageBps, side, true);
    const riskBudget = account.current_balance * (config_1.config.risk.maxRiskPerTradePct / 100);
    const stopDistance = Math.max(0.00001, Math.abs(effectiveEntry - idea.stop_loss));
    const quantity = Math.max(0, riskBudget / stopDistance);
    if (quantity <= 0)
        return;
    const notional = quantity * effectiveEntry;
    const entryFee = calculateFee(notional, feeBps);
    const inserted = await (0, queries_1.insertPaperPosition)({
        account_id: account.id,
        trade_idea_id: idea.id,
        symbol: idea.ticker,
        market_type: idea.market_type,
        strategy_slug: idea.strategy_slug,
        side,
        status: 'open',
        quantity,
        entry_price: quote.price,
        effective_entry_price: effectiveEntry,
        stop_loss: idea.stop_loss,
        trailing_stop: null,
        take_profit_1: idea.take_profit_1,
        take_profit_2: idea.take_profit_2,
        partial_tp_taken: false,
        partial_tp_ratio: 0.5,
        slippage_bps: slippageBps,
        fee_bps: feeBps,
        realized_pnl: -entryFee,
        unrealized_pnl: 0,
        max_favorable_excursion: null,
        max_adverse_excursion: null,
        opened_at: new Date().toISOString(),
        closed_at: null,
        close_reason: null,
    });
    if (!inserted)
        return;
    await (0, queries_1.insertPaperFill)({
        position_id: inserted.id,
        fill_type: 'entry',
        quantity,
        price: effectiveEntry,
        fee_paid: entryFee,
        realized_pnl: -entryFee,
    });
    await (0, queries_1.updatePaperAccount)(account.id, {
        current_balance: account.current_balance - entryFee,
        realized_pnl: account.realized_pnl - entryFee,
    });
    log.info('Paper position opened', {
        tradeIdeaId: idea.id,
        symbol: idea.ticker,
        quantity,
        effectiveEntry,
        entryFee,
    });
}
async function updatePaperPortfolio() {
    if (!config_1.config.paper.mode)
        return;
    const account = await (0, queries_1.getDefaultPaperAccount)();
    if (!account)
        return;
    const positions = await (0, queries_1.getOpenPaperPositions)(account.id);
    let unrealizedTotal = 0;
    let realizedDelta = 0;
    for (const position of positions) {
        const quote = await (0, providers_1.getQuoteWithFailover)(position.symbol, position.market_type);
        if (!quote || quote.price <= 0)
            continue;
        const signed = position.side === 'LONG' ? 1 : -1;
        const grossPnl = (quote.price - position.effective_entry_price) * position.quantity * signed;
        let netPnl = grossPnl;
        const mfe = Math.max(position.max_favorable_excursion ?? grossPnl, grossPnl);
        const mae = Math.min(position.max_adverse_excursion ?? grossPnl, grossPnl);
        const trailingGap = Math.abs(position.effective_entry_price - position.stop_loss);
        const trailingStop = position.side === 'LONG'
            ? Math.max(position.trailing_stop ?? position.stop_loss, quote.price - trailingGap)
            : Math.min(position.trailing_stop ?? position.stop_loss, quote.price + trailingGap);
        let shouldClose = false;
        let closeReason = '';
        let closePrice = quote.price;
        if (position.side === 'LONG') {
            if (quote.price <= trailingStop) {
                shouldClose = true;
                closeReason = position.trailing_stop ? 'trailing_stop' : 'stop_loss';
            }
            if (position.take_profit_2 && quote.price >= position.take_profit_2) {
                shouldClose = true;
                closeReason = 'final_exit';
            }
        }
        else {
            if (quote.price >= trailingStop) {
                shouldClose = true;
                closeReason = position.trailing_stop ? 'trailing_stop' : 'stop_loss';
            }
            if (position.take_profit_2 && quote.price <= position.take_profit_2) {
                shouldClose = true;
                closeReason = 'final_exit';
            }
        }
        if (!position.partial_tp_taken && position.take_profit_1) {
            const tpReached = position.side === 'LONG' ? quote.price >= position.take_profit_1 : quote.price <= position.take_profit_1;
            if (tpReached) {
                const partialQty = position.quantity * position.partial_tp_ratio;
                const partialPrice = applySlippage(quote.price, position.slippage_bps, position.side, false);
                const partialSignedPnl = (partialPrice - position.effective_entry_price) * partialQty * signed;
                const fee = calculateFee(partialQty * partialPrice, position.fee_bps);
                const realized = partialSignedPnl - fee;
                await (0, queries_1.insertPaperFill)({
                    position_id: position.id,
                    fill_type: 'partial_tp',
                    quantity: partialQty,
                    price: partialPrice,
                    fee_paid: fee,
                    realized_pnl: realized,
                });
                await (0, queries_1.updatePaperPosition)(position.id, {
                    partial_tp_taken: true,
                    quantity: position.quantity - partialQty,
                    realized_pnl: position.realized_pnl + realized,
                    trailing_stop: trailingStop,
                });
                realizedDelta += realized;
                netPnl = (quote.price - position.effective_entry_price) * (position.quantity - partialQty) * signed;
            }
        }
        if (shouldClose) {
            const effectiveExit = applySlippage(closePrice, position.slippage_bps, position.side, false);
            const fee = calculateFee(position.quantity * effectiveExit, position.fee_bps);
            const realized = (effectiveExit - position.effective_entry_price) * position.quantity * signed - fee + position.realized_pnl;
            await (0, queries_1.insertPaperFill)({
                position_id: position.id,
                fill_type: closeReason,
                quantity: position.quantity,
                price: effectiveExit,
                fee_paid: fee,
                realized_pnl: realized,
            });
            await (0, queries_1.updatePaperPosition)(position.id, {
                status: 'closed',
                closed_at: new Date().toISOString(),
                close_reason: closeReason,
                trailing_stop: trailingStop,
                realized_pnl: realized,
                unrealized_pnl: 0,
                max_favorable_excursion: mfe,
                max_adverse_excursion: mae,
            });
            realizedDelta += realized;
            continue;
        }
        await (0, queries_1.updatePaperPosition)(position.id, {
            trailing_stop: trailingStop,
            unrealized_pnl: netPnl,
            max_favorable_excursion: mfe,
            max_adverse_excursion: mae,
        });
        unrealizedTotal += netPnl;
    }
    const updatedBalance = account.current_balance + realizedDelta;
    const updatedRealized = account.realized_pnl + realizedDelta;
    const equity = updatedBalance + unrealizedTotal;
    await (0, queries_1.updatePaperAccount)(account.id, {
        current_balance: updatedBalance,
        realized_pnl: updatedRealized,
        unrealized_pnl: unrealizedTotal,
    });
    await (0, queries_1.insertPaperEquitySnapshot)({
        account_id: account.id,
        equity,
        balance: updatedBalance,
        unrealized_pnl: unrealizedTotal,
        realized_pnl: updatedRealized,
        recorded_at: new Date().toISOString(),
    });
}
