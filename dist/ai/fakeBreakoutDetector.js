"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeBreakoutDetector = void 0;
const indicators_1 = require("../utils/indicators");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('ai:fakeBreakout');
class FakeBreakoutDetector {
    /**
     * Analyzes candles for fake breakout patterns
     * Returns analysis with confidence score for rejecting signals
     */
    analyze(candles, breakoutLevel, direction) {
        if (candles.length < 5) {
            return {
                isFakeout: false,
                confidence: 0,
                reason: 'Insufficient data',
                details: { wickRatio: 0, volumeDecline: 0, rejectionStrength: 0, divergenceScore: 0 }
            };
        }
        const breakoutCandle = candles[candles.length - 1];
        const priorCandles = candles.slice(-5, -1);
        // 1. Wick analysis - large wick relative to body indicates rejection
        const wickRatio = this.calculateWickRatio(breakoutCandle, direction);
        // 2. Volume analysis - declining volume after breakout is suspicious
        const volumeDecline = this.analyzeVolumeDecline(candles);
        // 3. Rejection strength - how strongly price was rejected
        const rejectionStrength = this.calculateRejectionStrength(breakoutCandle, breakoutLevel, direction);
        // 4. Divergence analysis - momentum divergence indicates weakness
        const divergenceScore = this.analyzeDivergence(candles);
        // 5. Close location analysis - breakout that doesn't hold close is suspicious
        const closeRejection = this.analyzeCloseRejection(breakoutCandle, breakoutLevel, direction);
        // Calculate overall fakeout confidence
        let confidence = 0;
        let reasons = [];
        // Wick ratio scoring
        if (wickRatio > 0.7) {
            confidence += 25;
            reasons.push(`Large wick ratio (${(wickRatio * 100).toFixed(1)}%)`);
        }
        else if (wickRatio > 0.5) {
            confidence += 15;
            reasons.push(`Moderate wick ratio (${(wickRatio * 100).toFixed(1)}%)`);
        }
        // Volume decline scoring
        if (volumeDecline > 0.3) {
            confidence += 20;
            reasons.push(`Volume declining ${(volumeDecline * 100).toFixed(1)}%`);
        }
        // Rejection strength scoring
        if (rejectionStrength > 0.02) {
            confidence += 20;
            reasons.push(`Strong rejection (${(rejectionStrength * 100).toFixed(2)}% from level)`);
        }
        // Divergence scoring
        if (divergenceScore > 0.7) {
            confidence += 15;
            reasons.push('Momentum divergence detected');
        }
        // Close rejection scoring
        if (closeRejection) {
            confidence += 20;
            reasons.push('Breakout failed to hold close');
        }
        // Additional pattern recognition
        if (this.isExhaustionCandle(breakoutCandle)) {
            confidence += 10;
            reasons.push('Exhaustion candle pattern');
        }
        if (this.isLiquidityGrab(candles, breakoutLevel, direction)) {
            confidence += 15;
            reasons.push('Liquidity grab pattern detected');
        }
        const isFakeout = confidence >= 40; // Threshold for fakeout detection
        const reason = reasons.length > 0 ? reasons.join(', ') : 'No fakeout patterns detected';
        log.debug(`Fakeout analysis for ${direction} breakout: ${confidence}% confidence, ${reason}`);
        return {
            isFakeout,
            confidence: Math.min(100, confidence),
            reason,
            details: {
                wickRatio,
                volumeDecline,
                rejectionStrength,
                divergenceScore
            }
        };
    }
    calculateWickRatio(candle, direction) {
        const bodySize = Math.abs(candle.close - candle.open);
        const totalRange = candle.high - candle.low;
        if (totalRange === 0)
            return 0;
        if (direction === 'up') {
            // For upside breakout, check upper wick
            const upperWick = candle.high - Math.max(candle.open, candle.close);
            return upperWick / totalRange;
        }
        else {
            // For downside breakout, check lower wick
            const lowerWick = Math.min(candle.open, candle.close) - candle.low;
            return lowerWick / totalRange;
        }
    }
    analyzeVolumeDecline(candles) {
        if (candles.length < 3)
            return 0;
        const recentVolumes = candles.slice(-3).map(c => c.volume);
        const avgRecent = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
        const avgPrior = (0, indicators_1.averageVolume)(candles.slice(0, -3), 10);
        if (avgPrior === 0)
            return 0;
        const decline = (avgPrior - avgRecent) / avgPrior;
        return Math.max(0, decline);
    }
    calculateRejectionStrength(candle, level, direction) {
        if (direction === 'up') {
            // How far price was rejected above the breakout level
            const rejectionDistance = candle.high - level;
            const levelRange = level * 0.005; // 0.5% of level
            return rejectionDistance / levelRange;
        }
        else {
            // How far price was rejected below the breakout level
            const rejectionDistance = level - candle.low;
            const levelRange = level * 0.005; // 0.5% of level
            return rejectionDistance / levelRange;
        }
    }
    analyzeDivergence(candles) {
        if (candles.length < 10)
            return 0;
        // Simple RSI divergence check
        const closes = candles.map(c => c.close);
        const rsiValues = this.calculateRSIArray(closes, 14);
        if (rsiValues.length < 5)
            return 0;
        const recentPrices = closes.slice(-5);
        const recentRSI = rsiValues.slice(-5);
        // Check for bearish divergence (price higher high, RSI lower high)
        const priceHigherHigh = recentPrices[4] > recentPrices[2] && recentPrices[2] > recentPrices[0];
        const rsiLowerHigh = recentRSI[4] < recentRSI[2] && recentRSI[2] < recentRSI[0];
        if (priceHigherHigh && rsiLowerHigh)
            return 0.8;
        // Check for bullish divergence (price lower low, RSI higher low)
        const priceLowerLow = recentPrices[4] < recentPrices[2] && recentPrices[2] < recentPrices[0];
        const rsiHigherLow = recentRSI[4] > recentRSI[2] && recentRSI[2] > recentRSI[0];
        if (priceLowerLow && rsiHigherLow)
            return 0.8;
        return 0;
    }
    analyzeCloseRejection(candle, level, direction) {
        const tolerance = level * 0.002; // 0.2% tolerance
        if (direction === 'up') {
            // For upside breakout, close should be above level
            return candle.close < (level - tolerance);
        }
        else {
            // For downside breakout, close should be below level
            return candle.close > (level + tolerance);
        }
    }
    isExhaustionCandle(candle) {
        const bodySize = Math.abs(candle.close - candle.open);
        const totalRange = candle.high - candle.low;
        if (totalRange === 0)
            return false;
        // Exhaustion candle has small body relative to total range
        const bodyRatio = bodySize / totalRange;
        return bodyRatio < 0.3; // Body less than 30% of total range
    }
    isLiquidityGrab(candles, level, direction) {
        if (candles.length < 3)
            return false;
        const recentCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];
        // Liquidity grab often shows sudden volume spike then quick reversal
        const volumeSpike = recentCandle.volume > prevCandle.volume * 1.5;
        const quickReversal = direction === 'up' ?
            recentCandle.close < recentCandle.high * 0.99 : // Failed to hold upside
            recentCandle.close > recentCandle.low * 1.01; // Failed to hold downside
        return volumeSpike && quickReversal;
    }
    calculateRSIArray(closes, period) {
        const rsiValues = [];
        const gains = [];
        const losses = [];
        for (let i = 1; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        for (let i = period - 1; i < gains.length; i++) {
            const avgGain = gains.slice(i - period + 1, i + 1).reduce((sum, g) => sum + g, 0) / period;
            const avgLoss = losses.slice(i - period + 1, i + 1).reduce((sum, l) => sum + l, 0) / period;
            if (avgLoss === 0) {
                rsiValues.push(100);
            }
            else {
                const rs = avgGain / avgLoss;
                rsiValues.push(100 - (100 / (1 + rs)));
            }
        }
        return rsiValues;
    }
}
exports.FakeBreakoutDetector = FakeBreakoutDetector;
