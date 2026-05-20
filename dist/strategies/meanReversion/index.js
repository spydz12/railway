"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeanReversionStrategy = void 0;
const base_1 = require("../base");
const logger_1 = require("../../utils/logger");
const log = (0, logger_1.createComponentLogger)('strategy:mean_reversion');
class MeanReversionStrategy {
    constructor() {
        this.slug = 'mean_reversion';
        this.name = 'Mean Reversion';
    }
    evaluate(candles, ticker, timeframe) {
        if (candles.length < 60) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        // Calculate Bollinger Bands
        const bb = this.calculateBollingerBands(candles, 20, 2);
        if (!bb.upper || !bb.lower || !bb.middle) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        // Calculate RSI
        const rsi2 = this.calculateRSI(candles.map(c => c.close), 2);
        const rsi14 = this.calculateRSI(candles.map(c => c.close), 14);
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];
        // Check for oversold/overbought conditions
        const oversold = lastCandle.close < bb.lower && rsi2 < 10 && rsi14 < 30;
        const overbought = lastCandle.close > bb.upper && rsi2 > 90 && rsi14 > 70;
        if (!oversold && !overbought) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        // Check for bullish/bearish divergence (simplified)
        const divergence = this.checkDivergence(candles, oversold ? 'bullish' : 'bearish');
        // Avoid strong trending markets
        const trendStrength = this.calculateTrendStrength(candles);
        if (trendStrength > 0.02) { // Strong trend
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const side = oversold ? 'LONG' : 'SHORT';
        const entry = lastCandle.close;
        // Stop loss beyond opposite band
        const stopLoss = oversold ? bb.lower * 0.98 : bb.upper * 1.02;
        // Targets at middle band and opposite band
        const takeProfit1 = bb.middle;
        const takeProfit2 = oversold ? bb.upper : bb.lower;
        const risk = Math.abs(entry - stopLoss);
        const reward1 = Math.abs(takeProfit1 - entry);
        const riskReward = reward1 / risk;
        // Build reasons
        const reasons = ['mean_reversion'];
        if (oversold)
            reasons.push('oversold');
        if (overbought)
            reasons.push('overbought');
        if (divergence)
            reasons.push('divergence');
        if (rsi2 < 5 || rsi2 > 95)
            reasons.push('extreme_rsi');
        // Calculate confidence
        let confidence = 50; // Base confidence
        if (divergence)
            confidence += 20;
        if (rsi2 < 5 || rsi2 > 95)
            confidence += 15;
        if (trendStrength < 0.01)
            confidence += 15; // Better in sideways markets
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
            volumeConfirmation: false,
            marketCondition: 'neutral',
        };
    }
    calculateBollingerBands(candles, period, stdDev) {
        if (candles.length < period) {
            return { upper: 0, middle: 0, lower: 0 };
        }
        const closes = candles.map(c => c.close);
        const slice = closes.slice(-period);
        const sma = slice.reduce((sum, price) => sum + price, 0) / period;
        const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
        const std = Math.sqrt(variance);
        return {
            upper: sma + (stdDev * std),
            middle: sma,
            lower: sma - (stdDev * std),
        };
    }
    calculateRSI(closes, period) {
        if (closes.length < period + 1)
            return 50;
        const gains = [];
        const losses = [];
        for (let i = 1; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        const avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
        const avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;
        if (avgLoss === 0)
            return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    checkDivergence(candles, direction) {
        // Simplified divergence check - price making lower lows but RSI making higher lows (bullish)
        // or price making higher highs but RSI making lower highs (bearish)
        if (candles.length < 10)
            return false;
        const closes = candles.map(c => c.close);
        const rsiValues = [];
        for (let i = 3; i <= closes.length; i++) {
            rsiValues.push(this.calculateRSI(closes.slice(0, i), 14));
        }
        // Check last few points for divergence pattern
        const recentCloses = closes.slice(-5);
        const recentRSI = rsiValues.slice(-5);
        if (direction === 'bullish') {
            // Price lower low, RSI higher low
            const priceLowerLow = recentCloses[4] < recentCloses[2] && recentCloses[2] < recentCloses[0];
            const rsiHigherLow = recentRSI[4] > recentRSI[2] && recentRSI[2] > recentRSI[0];
            return priceLowerLow && rsiHigherLow;
        }
        else {
            // Price higher high, RSI lower high
            const priceHigherHigh = recentCloses[4] > recentCloses[2] && recentCloses[2] > recentCloses[0];
            const rsiLowerHigh = recentRSI[4] < recentRSI[2] && recentRSI[2] < recentRSI[0];
            return priceHigherHigh && rsiLowerHigh;
        }
    }
    calculateTrendStrength(candles) {
        if (candles.length < 20)
            return 0;
        const closes = candles.map(c => c.close);
        const sma20 = closes.slice(-20).reduce((sum, price) => sum + price, 0) / 20;
        const sma50 = closes.slice(-50).reduce((sum, price) => sum + price, 0) / 50;
        return Math.abs(sma20 - sma50) / sma50;
    }
}
exports.MeanReversionStrategy = MeanReversionStrategy;
