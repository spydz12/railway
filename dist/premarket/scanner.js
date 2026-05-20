"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PremarketScanner = void 0;
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('premarket:scanner');
class PremarketScanner {
    constructor() {
        this.MIN_GAP_PERCENT = 2.0; // Minimum gap for consideration
        this.MIN_VOLUME_RATIO = 1.5; // Minimum volume ratio vs average
        this.HIGH_VOLUME_THRESHOLD = 3.0; // High volume multiplier
    }
    /**
     * Scans premarket data for trading opportunities
     */
    scanPremarketActivity(premarketData, averageVolumes) {
        const signals = [];
        for (const data of premarketData) {
            const signal = this.analyzePremarketData(data, averageVolumes.get(data.symbol) || 0);
            if (signal) {
                signals.push(signal);
            }
        }
        // Sort by strength and confidence
        signals.sort((a, b) => (b.strength + b.confidence) - (a.strength + a.confidence));
        log.info(`Premarket scan complete: ${signals.length} signals found`);
        return signals;
    }
    /**
     * Analyzes individual premarket data point
     */
    analyzePremarketData(data, avgVolume) {
        const gapSize = Math.abs(data.gapPercent);
        const volumeRatio = data.volumeRatio || (avgVolume > 0 ? data.premarketVolume / avgVolume : 1);
        const premarketRange = ((data.premarketHigh - data.premarketLow) / data.previousClose) * 100;
        // Skip if insufficient activity
        if (gapSize < this.MIN_GAP_PERCENT && volumeRatio < this.MIN_VOLUME_RATIO) {
            return null;
        }
        let signalType;
        let strength = 0;
        let confidence = 0;
        let recommendation = 'WATCH';
        // Determine signal type and strength
        if (gapSize >= this.MIN_GAP_PERCENT) {
            if (data.gapPercent > 0) {
                signalType = 'gap_up';
                strength = Math.min(100, gapSize * 10); // Scale gap percentage
                confidence = this.calculateGapConfidence(data, volumeRatio, premarketRange);
                recommendation = confidence > 70 ? 'BUY' : 'WATCH';
            }
            else {
                signalType = 'gap_down';
                strength = Math.min(100, Math.abs(data.gapPercent) * 10);
                confidence = this.calculateGapConfidence(data, volumeRatio, premarketRange);
                recommendation = confidence > 70 ? 'SELL' : 'WATCH';
            }
        }
        else if (volumeRatio >= this.HIGH_VOLUME_THRESHOLD) {
            signalType = 'high_volume';
            strength = Math.min(100, (volumeRatio - 1) * 25);
            confidence = this.calculateVolumeConfidence(data, volumeRatio, premarketRange);
            recommendation = 'WATCH'; // High volume needs context
        }
        else if (premarketRange > 3.0) {
            // Check for breakouts/breakdowns within premarket
            const rangeDirection = data.openPrice > data.previousClose ? 'up' : 'down';
            signalType = rangeDirection === 'up' ? 'breakout' : 'breakdown';
            strength = Math.min(100, premarketRange * 5);
            confidence = this.calculateRangeConfidence(data, volumeRatio, premarketRange);
            recommendation = confidence > 60 ? (rangeDirection === 'up' ? 'BUY' : 'SELL') : 'WATCH';
        }
        else {
            return null; // No significant signal
        }
        // Boost confidence for high volume + gap combinations
        if (volumeRatio >= this.MIN_VOLUME_RATIO && gapSize >= this.MIN_GAP_PERCENT) {
            confidence = Math.min(100, confidence + 15);
        }
        // Reduce confidence for extreme gaps (might be news-driven)
        if (gapSize > 10) {
            confidence *= 0.8;
        }
        const momentum = this.calculatePremarketMomentum(data);
        return {
            symbol: data.symbol,
            signalType,
            strength: Math.round(strength),
            confidence: Math.round(confidence),
            details: {
                gapSize: data.gapPercent,
                volumeMultiplier: volumeRatio,
                premarketRange,
                momentum
            },
            recommendation
        };
    }
    calculateGapConfidence(data, volumeRatio, premarketRange) {
        let confidence = 50; // Base confidence
        // Volume support increases confidence
        if (volumeRatio >= this.MIN_VOLUME_RATIO) {
            confidence += 20;
        }
        if (volumeRatio >= this.HIGH_VOLUME_THRESHOLD) {
            confidence += 15;
        }
        // Controlled premarket range increases confidence
        if (premarketRange < 5) {
            confidence += 10;
        }
        else if (premarketRange > 10) {
            confidence -= 10; // Volatile premarket reduces confidence
        }
        // Gap size consideration
        const gapSize = Math.abs(data.gapPercent);
        if (gapSize > 5 && gapSize <= 8) {
            confidence += 10; // Optimal gap size
        }
        else if (gapSize > 8) {
            confidence -= 5; // Very large gaps are risky
        }
        return Math.max(0, Math.min(100, confidence));
    }
    calculateVolumeConfidence(data, volumeRatio, premarketRange) {
        let confidence = 40; // Base confidence for high volume
        // Higher volume ratios increase confidence
        if (volumeRatio >= 5) {
            confidence += 30;
        }
        else if (volumeRatio >= 3) {
            confidence += 20;
        }
        else if (volumeRatio >= 2) {
            confidence += 10;
        }
        // Premarket range context
        if (premarketRange > 2) {
            confidence += 10; // Volume with movement is more significant
        }
        return Math.max(0, Math.min(100, confidence));
    }
    calculateRangeConfidence(data, volumeRatio, premarketRange) {
        let confidence = 45; // Base confidence
        // Volume support
        if (volumeRatio >= 1.5) {
            confidence += 15;
        }
        // Range size consideration
        if (premarketRange >= 3 && premarketRange <= 7) {
            confidence += 20; // Good range size
        }
        else if (premarketRange > 7) {
            confidence += 10; // Large range but still valid
        }
        // Gap context - breakouts against the gap are stronger
        const gapDirection = data.gapPercent > 0 ? 'up' : 'down';
        const breakoutDirection = data.openPrice > data.previousClose ? 'up' : 'down';
        if (gapDirection !== breakoutDirection) {
            confidence += 10; // Counter-gap breakout is significant
        }
        return Math.max(0, Math.min(100, confidence));
    }
    calculatePremarketMomentum(data) {
        // Simple momentum calculation based on open vs previous close and range
        const priceChange = (data.openPrice - data.previousClose) / data.previousClose;
        const range = (data.premarketHigh - data.premarketLow) / data.previousClose;
        // Momentum is price change adjusted by range (controlled movement is stronger)
        const rangeAdjustment = range > 0 ? Math.min(1, 2 / range) : 0;
        return priceChange * rangeAdjustment * 100;
    }
    /**
     * Filters signals based on quality criteria
     */
    filterQualitySignals(signals) {
        return signals.filter(signal => {
            // Must have minimum confidence and strength
            if (signal.confidence < 50 || signal.strength < 30) {
                return false;
            }
            // Gap signals need volume support
            if ((signal.signalType === 'gap_up' || signal.signalType === 'gap_down') &&
                signal.details.volumeMultiplier < 1.2) {
                return false;
            }
            // High volume signals need some price movement
            if (signal.signalType === 'high_volume' && signal.details.premarketRange < 1) {
                return false;
            }
            return true;
        });
    }
    /**
     * Gets premarket summary statistics
     */
    getPremarketSummary(signals) {
        const buySignals = signals.filter(s => s.recommendation === 'BUY').length;
        const sellSignals = signals.filter(s => s.recommendation === 'SELL').length;
        const watchSignals = signals.filter(s => s.recommendation === 'WATCH').length;
        const avgConfidence = signals.length > 0 ?
            signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length : 0;
        const avgStrength = signals.length > 0 ?
            signals.reduce((sum, s) => sum + s.strength, 0) / signals.length : 0;
        return {
            totalSignals: signals.length,
            buySignals,
            sellSignals,
            watchSignals,
            averageConfidence: Math.round(avgConfidence),
            averageStrength: Math.round(avgStrength)
        };
    }
}
exports.PremarketScanner = PremarketScanner;
