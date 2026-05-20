"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoVWAPReclaimStrategy = void 0;
const indicators_1 = require("../../utils/indicators");
const base_1 = require("../base");
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const log = (0, logger_1.createComponentLogger)('strategy:crypto_vwap_reclaim');
const debug = config_1.config.crypto.debugSignals;
class CryptoVWAPReclaimStrategy {
    constructor() {
        this.slug = 'crypto_vwap_reclaim';
        this.name = 'VWAP Crypto Reclaim';
    }
    evaluate(candles, ticker, timeframe) {
        if (debug) {
            log.debug('[STRATEGY] Running: VWAP Crypto Reclaim', { ticker, timeframe, candleCount: candles.length });
        }
        if (candles.length < 40) {
            if (debug)
                log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const cumulative = candles.reduce((acc, candle) => {
            const typical = (candle.high + candle.low + candle.close) / 3;
            return {
                volume: acc.volume + candle.volume,
                volumePrice: acc.volumePrice + candle.volume * typical,
            };
        }, { volume: 0, volumePrice: 0 });
        const vwap = cumulative.volume > 0 ? cumulative.volumePrice / cumulative.volume : last.close;
        const flushedBelow = prev.low < vwap * 0.99;
        const reclaimed = last.close > vwap;
        if (!flushedBelow || !reclaimed) {
            if (debug)
                log.debug('[NO_SIGNAL] reclaim conditions not met', { ticker, timeframe, flushedBelow, reclaimed, vwap, lastClose: last.close });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const avgVol = (0, indicators_1.averageVolume)(candles.slice(0, -1), 20);
        if (avgVol <= 0 || last.volume < avgVol * 1.9) {
            if (debug)
                log.debug('[NO_SIGNAL] reclaim volume weak', { ticker, timeframe, lastVolume: last.volume, avgVol });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const entry = (0, indicators_1.round2)(last.close);
        const stopLoss = (0, indicators_1.round2)(Math.min(prev.low, vwap * 0.985));
        const risk = entry - stopLoss;
        if (risk <= 0)
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        const tp1 = (0, indicators_1.round2)(entry + risk * 2.3);
        const tp2 = (0, indicators_1.round2)(entry + risk * 3.4);
        const confidence = Math.min(100, 62 + (last.volume / avgVol > 2 ? 12 : 6));
        const rr = (0, indicators_1.round2)((tp1 - entry) / risk);
        return {
            valid: true,
            strategy: this.slug,
            symbol: ticker,
            side: 'LONG',
            confidence,
            entry,
            stopLoss,
            takeProfit1: tp1,
            takeProfit2: tp2,
            riskReward: rr,
            reasons: ['flush below VWAP', 'reclaim above VWAP', 'strong bounce volume'],
            timeframe,
            volumeConfirmation: last.volume >= avgVol * 1.9,
            marketCondition: 'bullish',
        };
    }
}
exports.CryptoVWAPReclaimStrategy = CryptoVWAPReclaimStrategy;
