"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMACloudTrendStrategy = void 0;
const indicators_1 = require("../../utils/indicators");
const base_1 = require("../base");
const logger_1 = require("../../utils/logger");
const log = (0, logger_1.createComponentLogger)('strategy:ema_cloud');
class EMACloudTrendStrategy {
    constructor() {
        this.slug = 'ema_cloud_trend';
        this.name = 'EMA Cloud Trend';
    }
    evaluate(candles, ticker, timeframe) {
        if (candles.length < 60) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        // Calculate EMAs
        const ema21 = this.calculateEMA(candles.map(c => c.close), 21);
        const ema50 = this.calculateEMA(candles.map(c => c.close), 50);
        if (!ema21 || !ema50) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];
        // Determine trend direction
        const bullishTrend = ema21 > ema50;
        const bearishTrend = ema21 < ema50;
        if (!bullishTrend && !bearishTrend) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        // Find pullback into cloud
        const cloudTop = Math.max(ema21, ema50);
        const cloudBottom = Math.min(ema21, ema50);
        const inCloud = prevCandle.low <= cloudTop && prevCandle.high >= cloudBottom;
        const pullbackIntoCloud = bullishTrend ?
            prevCandle.close < cloudTop && prevCandle.close > cloudBottom :
            prevCandle.close > cloudBottom && prevCandle.close < cloudTop;
        if (!inCloud && !pullbackIntoCloud) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        // Check for rejection candle
        const rejectionCandle = bullishTrend ?
            lastCandle.close > lastCandle.open && lastCandle.close > prevCandle.high :
            lastCandle.close < lastCandle.open && lastCandle.close < prevCandle.low;
        if (!rejectionCandle) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        // Calculate entry and levels
        const side = bullishTrend ? 'LONG' : 'SHORT';
        const entry = lastCandle.close;
        // Stop loss below/above recent swing
        const recentCandles = candles.slice(-20);
        const stopLoss = bullishTrend ?
            Math.min(...recentCandles.map(c => c.low)) :
            Math.max(...recentCandles.map(c => c.high));
        const atr = (0, indicators_1.safeAtr)(candles, 14);
        const risk = Math.abs(entry - stopLoss);
        // Targets based on trend continuation
        const trendStrength = Math.abs(ema21 - ema50) / ema50;
        const targetMultiplier = 2 + (trendStrength * 2); // 2-4x risk based on trend strength
        const takeProfit1 = bullishTrend ?
            entry + (risk * targetMultiplier) :
            entry - (risk * targetMultiplier);
        const takeProfit2 = bullishTrend ?
            entry + (risk * targetMultiplier * 1.5) :
            entry - (risk * targetMultiplier * 1.5);
        const riskReward = (Math.abs(takeProfit1 - entry) / risk);
        // Build reasons
        const reasons = ['ema_cloud_trend'];
        if (bullishTrend)
            reasons.push('bullish_trend');
        if (bearishTrend)
            reasons.push('bearish_trend');
        if (pullbackIntoCloud)
            reasons.push('pullback_rejection');
        if (trendStrength > 0.02)
            reasons.push('strong_trend');
        // Calculate confidence
        let confidence = 55; // Base confidence
        if (trendStrength > 0.02)
            confidence += 20;
        if (rejectionCandle)
            confidence += 15;
        if (riskReward >= 2)
            confidence += 10;
        return {
            valid: true,
            strategy: this.slug,
            symbol: ticker,
            side,
            confidence: Math.min(100, confidence),
            entry,
            stopLoss,
            takeProfit1,
            takeProfit2,
            riskReward,
            reasons,
            timeframe,
            volumeConfirmation: false, // Not volume-dependent
            marketCondition: side === 'LONG' ? 'bullish' : 'bearish',
        };
    }
    calculateEMA(values, period) {
        if (values.length < period)
            return 0;
        const multiplier = 2 / (period + 1);
        let ema = values.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
        for (let i = period; i < values.length; i++) {
            ema = (values[i] * multiplier) + (ema * (1 - multiplier));
        }
        return ema;
    }
}
exports.EMACloudTrendStrategy = EMACloudTrendStrategy;
