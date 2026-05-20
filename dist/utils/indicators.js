"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_CANDLES_REQUIRED = void 0;
exports.ema = ema;
exports.sma = sma;
exports.rsi = rsi;
exports.averageVolume = averageVolume;
exports.atr = atr;
exports.findResistanceLevels = findResistanceLevels;
exports.findSupportLevels = findSupportLevels;
exports.isHammer = isHammer;
exports.isBullishEngulfing = isBullishEngulfing;
exports.isBullishConfirmation = isBullishConfirmation;
exports.sortCandles = sortCandles;
exports.isCandlesFresh = isCandlesFresh;
exports.percentChange = percentChange;
exports.round2 = round2;
exports.safeAtr = safeAtr;
exports.bollingerBands = bollingerBands;
exports.volatility = volatility;
// ============================================================
// CORE INDICATORS
// ============================================================
function ema(values, period) {
    if (values.length < period)
        return [];
    const k = 2 / (period + 1);
    const result = [];
    let emaVal = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(emaVal);
    for (let i = period; i < values.length; i++) {
        emaVal = values[i] * k + emaVal * (1 - k);
        result.push(emaVal);
    }
    return result;
}
function sma(values, period) {
    const result = [];
    for (let i = period - 1; i < values.length; i++) {
        const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
    }
    return result;
}
function rsi(values, period = 14) {
    // Requires at least period+1 values to compute the first RSI
    if (values.length <= period)
        return [];
    const gains = [];
    const losses = [];
    for (let i = 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? Math.abs(diff) : 0);
    }
    const result = [];
    // Wilder's smoothing: seed with SMA of first `period` gains/losses
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
    }
    return result;
}
function averageVolume(candles, period = 20) {
    const slice = candles.slice(-period);
    if (slice.length === 0)
        return 0;
    return slice.reduce((a, c) => a + c.volume, 0) / slice.length;
}
// ATR: returns 0 if insufficient data rather than silently crashing.
// Callers MUST guard against a 0 return value.
function atr(candles, period = 14) {
    if (candles.length < period + 1)
        return 0;
    const trueRanges = candles.slice(1).map((c, i) => {
        const prev = candles[i];
        return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    });
    const slice = trueRanges.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
}
// ============================================================
// SUPPORT / RESISTANCE WITH CLUSTERING
// ============================================================
// Cluster raw levels that are within `tolerancePct` of each other.
// Returns the mean of each cluster — eliminates duplicate/noisy levels.
function clusterLevels(levels, tolerancePct = 0.003) {
    if (levels.length === 0)
        return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
        const last = clusters[clusters.length - 1];
        const mean = last.reduce((a, b) => a + b, 0) / last.length;
        if (Math.abs(sorted[i] - mean) / mean <= tolerancePct) {
            last.push(sorted[i]);
        }
        else {
            clusters.push([sorted[i]]);
        }
    }
    return clusters.map((c) => round2(c.reduce((a, b) => a + b, 0) / c.length));
}
function findResistanceLevels(candles, lookback = 20) {
    const slice = candles.slice(-lookback);
    const rawLevels = [];
    for (let i = 1; i < slice.length - 1; i++) {
        if (slice[i].high >= slice[i - 1].high && slice[i].high >= slice[i + 1].high) {
            rawLevels.push(slice[i].high);
        }
    }
    return clusterLevels(rawLevels);
}
function findSupportLevels(candles, lookback = 20) {
    const slice = candles.slice(-lookback);
    const rawLevels = [];
    for (let i = 1; i < slice.length - 1; i++) {
        if (slice[i].low <= slice[i - 1].low && slice[i].low <= slice[i + 1].low) {
            rawLevels.push(slice[i].low);
        }
    }
    return clusterLevels(rawLevels);
}
// ============================================================
// CANDLE PATTERNS
// ============================================================
function isHammer(candle) {
    const body = Math.abs(candle.close - candle.open);
    if (body === 0)
        return false;
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    return lowerShadow >= body * 2 && upperShadow <= body * 0.5;
}
function isBullishEngulfing(prev, curr) {
    const prevBearish = prev.close < prev.open;
    const currBullish = curr.close > curr.open;
    if (!prevBearish || !currBullish)
        return false;
    // Current candle body must fully engulf previous candle body
    return curr.open <= prev.close && curr.close >= prev.open;
}
// A confirmation candle: closes bullish AND in the upper 60% of its range
function isBullishConfirmation(candle) {
    if (candle.high === candle.low)
        return false;
    const closePct = (candle.close - candle.low) / (candle.high - candle.low);
    return candle.close > candle.open && closePct >= 0.6;
}
// ============================================================
// DATA QUALITY
// ============================================================
// Ensure candles are sorted ascending by time
function sortCandles(candles) {
    return [...candles].sort((a, b) => a.time - b.time);
}
// Check that the most recent candle is not stale.
// maxAgeMs: maximum allowed age of the last candle in milliseconds.
function isCandlesFresh(candles, timeframeMinutes) {
    if (candles.length === 0)
        return false;
    const lastCandle = candles[candles.length - 1];
    const allowedAgeMs = timeframeMinutes * 60000 * 3; // 3 candles worth of lag tolerance
    const ageMs = Date.now() - lastCandle.time;
    return ageMs <= allowedAgeMs;
}
// Minimum candles required to run analysis reliably
exports.MIN_CANDLES_REQUIRED = 60;
// ============================================================
// UTILITIES
// ============================================================
function percentChange(from, to) {
    if (from === 0)
        return 0;
    return ((to - from) / from) * 100;
}
function round2(val) {
    return Math.round(val * 100) / 100;
}
// Safe ATR: returns a positive fallback (1% of price) when ATR calculation fails
function safeAtr(candles, period = 14) {
    const val = atr(candles, period);
    if (val > 0)
        return val;
    // Fallback: 1% of the last close price
    const lastClose = candles[candles.length - 1]?.close ?? 100;
    return round2(lastClose * 0.01);
}
function bollingerBands(values, period = 20, multiplier = 2) {
    const middle = sma(values, period);
    const upper = [];
    const lower = [];
    for (let i = period - 1; i < values.length; i++) {
        const slice = values.slice(i - period + 1, i + 1);
        const mean = middle[i - period + 1];
        const variance = slice.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / period;
        const std = Math.sqrt(variance);
        upper.push(mean + multiplier * std);
        lower.push(mean - multiplier * std);
    }
    return { middle, upper, lower };
}
function volatility(candles, period = 20) {
    if (candles.length < period)
        return 0;
    const closes = candles.slice(-period).map(c => c.close);
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    if (returns.length === 0)
        return 0;
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance * 252); // Annualized volatility
}
