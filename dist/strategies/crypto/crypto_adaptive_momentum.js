"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoAdaptiveMomentumStrategy = void 0;
const indicators_1 = require("../../utils/indicators");
const base_1 = require("../base");
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const log = (0, logger_1.createComponentLogger)('strategy:crypto_adaptive_momentum');
const debug = config_1.config.crypto.debugSignals;
function vwap(candles) {
    const sample = candles.slice(-30);
    const denom = sample.reduce((sum, c) => sum + c.volume, 0);
    if (denom <= 0)
        return sample[sample.length - 1]?.close ?? 0;
    const numer = sample.reduce((sum, c) => sum + ((c.high + c.low + c.close) / 3) * c.volume, 0);
    return numer / denom;
}
function macdBullishCross(closes) {
    const ema12 = (0, indicators_1.ema)(closes, 12);
    const ema26 = (0, indicators_1.ema)(closes, 26);
    if (ema12.length === 0 || ema26.length === 0)
        return false;
    const offset = ema12.length - ema26.length;
    const macdSeries = [];
    for (let i = 0; i < ema26.length; i++) {
        macdSeries.push(ema12[i + offset] - ema26[i]);
    }
    const signal = (0, indicators_1.ema)(macdSeries, 9);
    if (signal.length < 2 || macdSeries.length < signal.length + 1)
        return false;
    const macdPrev = macdSeries[macdSeries.length - 2];
    const macdNow = macdSeries[macdSeries.length - 1];
    const signalPrev = signal[signal.length - 2];
    const signalNow = signal[signal.length - 1];
    return macdPrev <= signalPrev && macdNow > signalNow;
}
function averageAtr(candles, period = 14, windows = 6) {
    if (candles.length < period + windows + 1)
        return 0;
    const values = [];
    for (let i = 0; i < windows; i++) {
        const end = candles.length - i;
        const slice = candles.slice(0, end);
        values.push((0, indicators_1.safeAtr)(slice, period));
    }
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}
class CryptoAdaptiveMomentumStrategy {
    constructor() {
        this.slug = 'crypto_adaptive_momentum';
        this.name = 'Adaptive Momentum';
    }
    evaluate(candles, ticker, timeframe) {
        if (debug) {
            log.debug('[STRATEGY] Running: Adaptive Momentum', { ticker, timeframe, candleCount: candles.length });
        }
        if (candles.length < 80) {
            if (debug)
                log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const closes = candles.map((c) => c.close);
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const avgVol = (0, indicators_1.averageVolume)(candles.slice(0, -1), 20);
        const relativeVolume = avgVol > 0 ? last.volume / avgVol : 0;
        if (relativeVolume <= 1.5) {
            if (debug)
                log.debug('[NO_SIGNAL] volume not expanded', { ticker, timeframe, relativeVolume });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const ema21 = (0, indicators_1.ema)(closes, 21);
        const ema50 = (0, indicators_1.ema)(closes, 50);
        if (ema21.length < 2 || ema50.length < 2) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const ema21Rising = ema21[ema21.length - 1] > ema21[ema21.length - 2];
        const ema50Rising = ema50[ema50.length - 1] > ema50[ema50.length - 2];
        if (!ema21Rising || !ema50Rising) {
            if (debug)
                log.debug('[NO_SIGNAL] ema trend not rising', { ticker, timeframe, ema21Rising, ema50Rising });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        if (!macdBullishCross(closes)) {
            if (debug)
                log.debug('[NO_SIGNAL] macd not bullish cross', { ticker, timeframe });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const vwapVal = vwap(candles);
        if (last.close <= vwapVal) {
            if (debug)
                log.debug('[NO_SIGNAL] close below vwap', { ticker, timeframe, close: last.close, vwap: vwapVal });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const resistances = (0, indicators_1.findResistanceLevels)(candles, 24);
        const recentHigh = resistances.length > 0
            ? resistances[resistances.length - 1]
            : Math.max(...candles.slice(-20, -1).map((c) => c.high));
        if (last.close <= recentHigh * 0.998) {
            if (debug)
                log.debug('[NO_SIGNAL] breakout not confirmed', { ticker, timeframe, close: last.close, recentHigh });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const atrNow = (0, indicators_1.safeAtr)(candles, 14);
        const atrAvg = averageAtr(candles, 14, 6);
        if (atrAvg <= 0 || atrNow < atrAvg * 1.05) {
            if (debug)
                log.debug('[NO_SIGNAL] atr expansion missing', { ticker, timeframe, atrNow, atrAvg });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const body = Math.abs(last.close - last.open);
        const range = Math.max(last.high - last.low, 0);
        if (range <= 0 || body / range < 0.45 || last.close <= prev.close) {
            if (debug)
                log.debug('[NO_SIGNAL] weak candle', { ticker, timeframe, body, range });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const entry = (0, indicators_1.round2)(last.close);
        const stopLoss = (0, indicators_1.round2)(entry - atrNow * 1.3);
        const takeProfit1 = (0, indicators_1.round2)(entry + atrNow * 2.4);
        const takeProfit2 = (0, indicators_1.round2)(entry + atrNow * 3.6);
        const risk = entry - stopLoss;
        if (risk <= 0)
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        let confidence = 70;
        if (relativeVolume > 2.2)
            confidence += 10;
        if (body / range > 0.6)
            confidence += 10;
        log.info('[SIGNAL] adaptive momentum detected', {
            ticker,
            timeframe,
            relativeVolume,
            atrNow,
            atrAvg,
            candleBodyRatio: body / Math.max(range, 1e-9),
        });
        const result = {
            valid: true,
            strategy: this.slug,
            symbol: ticker,
            side: 'LONG',
            confidence: Math.min(92, confidence),
            entry,
            stopLoss,
            takeProfit1,
            takeProfit2,
            riskReward: (0, indicators_1.round2)((takeProfit1 - entry) / risk),
            reasons: ['relative volume expansion', 'ema trend acceleration', 'macd bullish cross', 'breakout continuation'],
            timeframe,
            volumeConfirmation: relativeVolume > 1.5,
            marketCondition: 'bullish',
        };
        log.info('[RESULT] Strategy evaluated', {
            ticker,
            timeframe,
            strategy: this.slug,
            valid: result.valid,
            side: result.side,
            confidence: result.confidence,
        });
        return result;
    }
}
exports.CryptoAdaptiveMomentumStrategy = CryptoAdaptiveMomentumStrategy;
