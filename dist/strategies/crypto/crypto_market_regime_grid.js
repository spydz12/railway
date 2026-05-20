"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoMarketRegimeGridStrategy = void 0;
const indicators_1 = require("../../utils/indicators");
const base_1 = require("../base");
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const log = (0, logger_1.createComponentLogger)('strategy:crypto_market_regime_grid');
const debug = config_1.config.crypto.debugSignals;
function calculateAdx(candles, period = 14) {
    if (candles.length < period + 2)
        return 0;
    const plusDm = [];
    const minusDm = [];
    const tr = [];
    for (let i = 1; i < candles.length; i++) {
        const curr = candles[i];
        const prev = candles[i - 1];
        const upMove = curr.high - prev.high;
        const downMove = prev.low - curr.low;
        plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
        tr.push(Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close)));
    }
    const adxWindowStart = Math.max(0, tr.length - period);
    const trSum = tr.slice(adxWindowStart).reduce((sum, v) => sum + v, 0);
    if (trSum <= 0)
        return 0;
    const plusSum = plusDm.slice(adxWindowStart).reduce((sum, v) => sum + v, 0);
    const minusSum = minusDm.slice(adxWindowStart).reduce((sum, v) => sum + v, 0);
    const plusDi = (plusSum / trSum) * 100;
    const minusDi = (minusSum / trSum) * 100;
    if (plusDi + minusDi === 0)
        return 0;
    const dx = Math.abs(plusDi - minusDi) / (plusDi + minusDi) * 100;
    return dx;
}
function touchCount(candles, level, tolerancePct = 0.004) {
    if (level <= 0)
        return 0;
    const tolerance = level * tolerancePct;
    return candles.reduce((count, candle) => {
        const touched = candle.low <= level + tolerance && candle.high >= level - tolerance;
        return touched ? count + 1 : count;
    }, 0);
}
class CryptoMarketRegimeGridStrategy {
    constructor() {
        this.slug = 'crypto_market_regime_grid';
        this.name = 'Binance Market Regime Grid';
    }
    evaluate(candles, ticker, timeframe) {
        if (debug) {
            log.debug('[STRATEGY] Running: Binance Market Regime Grid', { ticker, timeframe, candleCount: candles.length });
        }
        if (candles.length < 60) {
            if (debug)
                log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const closes = candles.map((c) => c.close);
        const last = candles[candles.length - 1];
        const ema21Arr = (0, indicators_1.ema)(closes, 21);
        const ema50Arr = (0, indicators_1.ema)(closes, 50);
        if (ema21Arr.length < 2 || ema50Arr.length < 2) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const atrVal = (0, indicators_1.safeAtr)(candles, 14);
        const atrPct = atrVal / Math.max(last.close, 1e-9);
        const adx = calculateAdx(candles, 14);
        const trendSpread = Math.abs(ema21Arr[ema21Arr.length - 1] - ema50Arr[ema50Arr.length - 1]) / Math.max(last.close, 1e-9);
        const bb = (0, indicators_1.bollingerBands)(closes, 20, 2);
        if (bb.lower.length === 0 || bb.upper.length === 0) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const upper = bb.upper[bb.upper.length - 1];
        const lower = bb.lower[bb.lower.length - 1];
        const inBandCount = candles.slice(-20).filter((c) => c.close >= lower && c.close <= upper).length;
        const regimeIsRanging = adx < 25 && trendSpread < 0.012 && inBandCount >= 14;
        if (!regimeIsRanging) {
            if (debug)
                log.debug('[NO_SIGNAL] market not ranging', { ticker, timeframe, adx, trendSpread, inBandCount });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        if (atrPct < 0.003 || atrPct > 0.05) {
            if (debug)
                log.debug('[NO_SIGNAL] atr not moderate', { ticker, timeframe, atrPct });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const supports = (0, indicators_1.findSupportLevels)(candles, 24);
        const resistances = (0, indicators_1.findResistanceLevels)(candles, 24);
        const support = supports.length > 0 ? supports[supports.length - 1] : lower;
        const resistance = resistances.length > 0 ? resistances[resistances.length - 1] : upper;
        const supportTouches = touchCount(candles.slice(-24), support);
        const resistanceTouches = touchCount(candles.slice(-24), resistance);
        if (supportTouches < 2 && resistanceTouches < 2) {
            if (debug)
                log.debug('[NO_SIGNAL] insufficient grid touches', { ticker, timeframe, supportTouches, resistanceTouches });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const nearLower = last.close <= lower * 1.01 || last.close <= support * 1.006;
        const nearUpper = last.close >= upper * 0.99 || last.close >= resistance * 0.994;
        if (!nearLower && !nearUpper) {
            if (debug)
                log.debug('[NO_SIGNAL] price not near grid zone', { ticker, timeframe, close: last.close, lower, upper, support, resistance });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const breakoutUp = last.close > upper * 1.003;
        const breakoutDown = last.close < lower * 0.997;
        if (trendSpread > 0.018 || breakoutUp || breakoutDown) {
            if (debug)
                log.debug('[NO_SIGNAL] breakout pressure detected', { ticker, timeframe, trendSpread, breakoutUp, breakoutDown });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const avgVol = (0, indicators_1.averageVolume)(candles.slice(0, -1), 20);
        const relativeVolume = avgVol > 0 ? last.volume / avgVol : 0;
        const rsiArr = (0, indicators_1.rsi)(closes, 14);
        const currentRsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
        const sideRaw = nearLower ? 'LONG' : 'SHORT';
        if (sideRaw === 'SHORT' && !config_1.config.crypto.allowShortSelling) {
            if (debug)
                log.debug('[NO_SIGNAL] short disabled by config', { ticker, timeframe });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const side = sideRaw;
        let confidence = 70;
        if (relativeVolume > 1.2)
            confidence += 8;
        if (side === 'LONG' && currentRsi <= 42)
            confidence += 8;
        if (side === 'SHORT' && currentRsi >= 58)
            confidence += 8;
        const entry = (0, indicators_1.round2)(last.close);
        const stopLoss = side === 'LONG'
            ? (0, indicators_1.round2)(entry - atrVal * 1.25)
            : (0, indicators_1.round2)(entry + atrVal * 1.25);
        const takeProfit1 = side === 'LONG'
            ? (0, indicators_1.round2)(entry + atrVal * 1.8)
            : (0, indicators_1.round2)(entry - atrVal * 1.8);
        const takeProfit2 = side === 'LONG'
            ? (0, indicators_1.round2)(entry + atrVal * 2.8)
            : (0, indicators_1.round2)(entry - atrVal * 2.8);
        const risk = Math.abs(entry - stopLoss);
        if (risk <= 0)
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        log.info('[SIGNAL] grid opportunity detected', {
            ticker,
            timeframe,
            side,
            adx,
            atrPct,
            supportTouches,
            resistanceTouches,
            relativeVolume,
            currentRsi,
        });
        const result = {
            valid: true,
            strategy: this.slug,
            symbol: ticker,
            side,
            confidence: Math.min(95, confidence),
            entry,
            stopLoss,
            takeProfit1,
            takeProfit2,
            riskReward: (0, indicators_1.round2)(Math.abs(takeProfit1 - entry) / risk),
            reasons: ['ranging regime', 'grid boundary touch', side === 'LONG' ? 'lower band reversion' : 'upper band fade'],
            timeframe,
            volumeConfirmation: relativeVolume > 1,
            marketCondition: 'ranging',
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
exports.CryptoMarketRegimeGridStrategy = CryptoMarketRegimeGridStrategy;
