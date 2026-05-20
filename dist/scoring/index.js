"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScoringEngine = exports.SignalQuality = exports.DEFAULT_SCORING_WEIGHTS = void 0;
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const categories_1 = require("../strategies/crypto/categories");
const log = (0, logger_1.createComponentLogger)('scoring');
exports.DEFAULT_SCORING_WEIGHTS = {
    volumeConfirmation: 15,
    vwapReclaim: 20,
    marketTrendAligned: 15,
    strongMomentum: 20,
    newsCatalyst: 20,
    lowFloatRisk: -10,
    weakLiquidity: -20,
    spreadTooWide: -15,
    lowVolume: -25,
    noCatalyst: -10,
    lowATR: -15,
    marketClosed: -100,
    conflictingIndicators: -20,
    weakTrend: -15,
    nearMajorResistance: -10,
    regimeMismatch: -25,
    sentimentPositive: 15,
    breakoutStrength: 20,
    meanReversionSetup: 15,
    rangeBounce: 10,
    fakeoutRisk: -20,
    relativeStrengthBonus: 10,
};
var SignalQuality;
(function (SignalQuality) {
    SignalQuality["HIGH"] = "HIGH";
    SignalQuality["MEDIUM"] = "MEDIUM";
    SignalQuality["WATCH"] = "WATCH";
    SignalQuality["REJECT"] = "REJECT";
})(SignalQuality || (exports.SignalQuality = SignalQuality = {}));
function getCryptoLiquidityThreshold(symbol) {
    const sym = symbol.toUpperCase();
    if (sym.startsWith('BTC') || sym.startsWith('ETH') || sym.startsWith('SOL') || sym.startsWith('BNB')) {
        return 500000;
    }
    if (sym.startsWith('LINK') || sym.startsWith('AVAX') || sym.startsWith('XRP') ||
        sym.startsWith('DOGE') || sym.startsWith('ADA')) {
        return 150000;
    }
    return 100000;
}
const BREAKOUT_MOMENTUM_SLUGS = ['crypto_momentum_breakout', 'crypto_adaptive_momentum', 'crypto_scalp_microbreakout'];
class ScoringEngine {
    constructor(weights = {}) {
        this.weights = { ...exports.DEFAULT_SCORING_WEIGHTS, ...weights };
    }
    scoreSignal(signal, marketData) {
        const breakdown = {};
        let totalScore = signal.confidence; // Start with strategy's base confidence
        const scoreEvents = [`base=${signal.confidence}`];
        const strategyCategory = (0, categories_1.getCryptoStrategyCategory)(signal.strategy);
        const isCrypto = signal.strategy.startsWith('crypto_');
        // Volume confirmation (crypto: require relativeVolume >= 1.2; stocks: use strategy flag)
        if (isCrypto) {
            if (signal.volumeConfirmation && marketData.relativeVolume >= 1.2) {
                breakdown.volumeConfirmation = this.weights.volumeConfirmation;
                totalScore += this.weights.volumeConfirmation;
                scoreEvents.push(`+${this.weights.volumeConfirmation} volume confirmation`);
            }
        }
        else {
            if (signal.volumeConfirmation) {
                breakdown.volumeConfirmation = this.weights.volumeConfirmation;
                totalScore += this.weights.volumeConfirmation;
                scoreEvents.push(`+${this.weights.volumeConfirmation} volume confirmation`);
            }
        }
        // VWAP reclaim
        if (signal.reasons.includes('vwap_reclaim')) {
            breakdown.vwapReclaim = this.weights.vwapReclaim;
            totalScore += this.weights.vwapReclaim;
            scoreEvents.push(`+${this.weights.vwapReclaim} vwap reclaim`);
        }
        // Market trend alignment
        if (marketData.trend === 'bullish' && signal.side === 'LONG') {
            breakdown.marketTrendAligned = this.weights.marketTrendAligned;
            totalScore += this.weights.marketTrendAligned;
            scoreEvents.push(`+${this.weights.marketTrendAligned} trend alignment`);
        }
        else if (marketData.trend === 'bearish' && signal.side === 'SHORT') {
            breakdown.marketTrendAligned = this.weights.marketTrendAligned;
            totalScore += this.weights.marketTrendAligned;
            scoreEvents.push(`+${this.weights.marketTrendAligned} trend alignment`);
        }
        // Strong momentum
        if (signal.reasons.includes('strong_momentum') || signal.reasons.includes('momentum_flag')) {
            breakdown.strongMomentum = this.weights.strongMomentum;
            totalScore += this.weights.strongMomentum;
            scoreEvents.push(`+${this.weights.strongMomentum} momentum`);
        }
        // News catalyst
        if (signal.reasons.includes('news_catalyst') || signal.reasons.includes('earnings')) {
            breakdown.newsCatalyst = this.weights.newsCatalyst;
            totalScore += this.weights.newsCatalyst;
            scoreEvents.push(`+${this.weights.newsCatalyst} catalyst`);
        }
        // Relative strength scoring
        if (marketData.relativeStrength !== undefined && marketData.relativeStrength > 65) {
            breakdown.relativeStrengthBonus = this.weights.relativeStrengthBonus;
            totalScore += this.weights.relativeStrengthBonus;
            scoreEvents.push(`+${this.weights.relativeStrengthBonus} relative strength`);
        }
        // Sentiment positive
        if (marketData.sentiment === 'bullish' && signal.side === 'LONG') {
            breakdown.sentimentPositive = this.weights.sentimentPositive;
            totalScore += this.weights.sentimentPositive;
            scoreEvents.push(`+${this.weights.sentimentPositive} sentiment`);
        }
        // Breakout strength
        if (signal.reasons.includes('orb_breakout') || signal.reasons.includes('breakout')) {
            breakdown.breakoutStrength = this.weights.breakoutStrength;
            totalScore += this.weights.breakoutStrength;
            scoreEvents.push(`+${this.weights.breakoutStrength} breakout`);
        }
        // Risk factors
        const rejectionReasons = [];
        // Fakeout risk penalty
        if (marketData.fakeoutConfidence !== undefined && marketData.fakeoutConfidence > 50) {
            const fakeoutPenalty = config_1.config.scanner.testMode
                ? this.weights.fakeoutRisk / 2
                : this.weights.fakeoutRisk;
            breakdown.fakeoutRisk = fakeoutPenalty;
            totalScore += fakeoutPenalty;
            rejectionReasons.push('High fake breakout risk');
            scoreEvents.push(`${fakeoutPenalty} fakeout risk`);
        }
        // Mean reversion setup
        if (signal.reasons.includes('mean_reversion') || signal.reasons.includes('bollinger_bounce')) {
            breakdown.meanReversionSetup = this.weights.meanReversionSetup;
            totalScore += this.weights.meanReversionSetup;
            scoreEvents.push(`+${this.weights.meanReversionSetup} mean reversion setup`);
        }
        // Range bounce
        if (signal.reasons.includes('range_bounce') || signal.reasons.includes('support_bounce')) {
            breakdown.rangeBounce = this.weights.rangeBounce;
            totalScore += this.weights.rangeBounce;
            scoreEvents.push(`+${this.weights.rangeBounce} range bounce`);
        }
        if (categories_1.MEAN_REVERSION_STRATEGIES.includes(signal.strategy)
            && marketData.regime === 'ranging') {
            totalScore += 10;
            scoreEvents.push('+10 ranging regime support');
        }
        // Trend strategy in ranging market — mild friction only, no auto-reject
        if (strategyCategory === 'TREND' && marketData.regime === 'ranging') {
            totalScore -= 10;
            scoreEvents.push('-10 trend strategy in ranging market');
        }
        // Low volume — uses the same effectiveVolumeThreshold the scanner used for gate validation.
        // A signal that already passed the gate is never penalised at -25; only a mild -8 applies
        // when relativeVolume is valid-but-weak (>= threshold yet < 0.8).
        if (isCrypto) {
            const volThreshold = marketData.effectiveVolumeThreshold ?? 0.6;
            if (marketData.relativeVolume < volThreshold) {
                breakdown.lowVolume = this.weights.lowVolume;
                totalScore += this.weights.lowVolume;
                rejectionReasons.push('Very low relative volume');
                scoreEvents.push(`${this.weights.lowVolume} very low relative volume`);
            }
            else if (marketData.relativeVolume < 0.8) {
                const mildVolumePenalty = -8;
                breakdown.lowVolume = mildVolumePenalty;
                totalScore += mildVolumePenalty;
                rejectionReasons.push('Below average relative volume');
                scoreEvents.push(`${mildVolumePenalty} mild low relative volume`);
            }
        }
        else {
            if (marketData.relativeVolume < 1.5) {
                breakdown.lowVolume = this.weights.lowVolume;
                totalScore += this.weights.lowVolume;
                rejectionReasons.push('Low relative volume');
                scoreEvents.push(`${this.weights.lowVolume} low relative volume`);
            }
        }
        // Weak liquidity (crypto: symbol-tier USD thresholds; stocks: 500k)
        const liquidityThreshold = isCrypto ? getCryptoLiquidityThreshold(signal.symbol) : 500000;
        if (marketData.averageVolume < liquidityThreshold) {
            breakdown.weakLiquidity = this.weights.weakLiquidity;
            totalScore += this.weights.weakLiquidity;
            rejectionReasons.push('Weak liquidity');
            scoreEvents.push(`${this.weights.weakLiquidity} weak liquidity`);
        }
        // Wide spread
        if (marketData.spread > 0.5) {
            breakdown.spreadTooWide = this.weights.spreadTooWide;
            totalScore += this.weights.spreadTooWide;
            rejectionReasons.push('Wide spread');
            scoreEvents.push(`${this.weights.spreadTooWide} wide spread`);
        }
        // Low ATR (only breakout/momentum strategies; EMA pullback, range, mean-reversion excluded)
        if (BREAKOUT_MOMENTUM_SLUGS.includes(signal.strategy) && marketData.atr < 1.0) {
            breakdown.lowATR = this.weights.lowATR;
            totalScore += this.weights.lowATR;
            rejectionReasons.push('Low volatility');
            scoreEvents.push(`${this.weights.lowATR} low volatility`);
        }
        else if (marketData.atr < 1.0) {
            scoreEvents.push('-0 low volatility (non-breakout strategy)');
        }
        // Market closed
        if (!marketData.marketOpen) {
            breakdown.marketClosed = this.weights.marketClosed;
            totalScore += this.weights.marketClosed;
            rejectionReasons.push('Market closed');
            scoreEvents.push(`${this.weights.marketClosed} market closed`);
        }
        // Conflicting indicators
        if (signal.reasons.includes('conflicting_signals')) {
            breakdown.conflictingIndicators = this.weights.conflictingIndicators;
            totalScore += this.weights.conflictingIndicators;
            rejectionReasons.push('Conflicting indicators');
            scoreEvents.push(`${this.weights.conflictingIndicators} conflicting indicators`);
        }
        // Weak trend (only penalize when trend actively opposes trade direction; neutral is not a kill)
        const trendOpposesTrade = (signal.side === 'LONG' && marketData.trend === 'bearish') ||
            (signal.side === 'SHORT' && marketData.trend === 'bullish');
        if (categories_1.TREND_STRATEGIES.includes(signal.strategy) && trendOpposesTrade) {
            breakdown.weakTrend = this.weights.weakTrend;
            totalScore += this.weights.weakTrend;
            rejectionReasons.push('Trend opposes trade direction');
            scoreEvents.push(`${this.weights.weakTrend} trend against trade`);
        }
        else if (categories_1.TREND_STRATEGIES.includes(signal.strategy) && marketData.trend === 'neutral') {
            scoreEvents.push('-0 neutral trend (no penalty for trend strategy)');
        }
        // Near major resistance
        if (signal.reasons.includes('near_resistance')) {
            breakdown.nearMajorResistance = this.weights.nearMajorResistance;
            totalScore += this.weights.nearMajorResistance;
            rejectionReasons.push('Near major resistance');
            scoreEvents.push(`${this.weights.nearMajorResistance} near resistance`);
        }
        // Regime mismatch
        if (marketData.regime === 'trending' && signal.strategy === 'mean_reversion') {
            breakdown.regimeMismatch = this.weights.regimeMismatch;
            totalScore += this.weights.regimeMismatch;
            rejectionReasons.push('Mean reversion in trending market');
            scoreEvents.push(`${this.weights.regimeMismatch} regime mismatch`);
        }
        else if (marketData.regime === 'ranging' && signal.strategy === 'breakout') {
            breakdown.regimeMismatch = this.weights.regimeMismatch;
            totalScore += this.weights.regimeMismatch;
            rejectionReasons.push('Breakout in ranging market');
            scoreEvents.push(`${this.weights.regimeMismatch} regime mismatch`);
        }
        // Clamp score to valid range before quality determination
        totalScore = Math.min(100, Math.max(0, totalScore));
        // Determine quality
        let quality;
        if (totalScore >= 70) {
            quality = SignalQuality.HIGH;
        }
        else if (totalScore >= 55) {
            quality = SignalQuality.MEDIUM;
        }
        else if (totalScore >= 45) {
            quality = SignalQuality.WATCH;
        }
        else {
            quality = SignalQuality.REJECT;
        }
        log.info('[SCORING]', {
            strategy: signal.strategy,
            category: strategyCategory,
            marketRegime: marketData.regime,
            trend: marketData.trend,
            scoreEvents,
            finalScore: totalScore,
            quality,
            rejectionReasons,
        });
        return {
            ...signal,
            totalScore,
            quality,
            scoringBreakdown: breakdown,
            rejectionReasons,
        };
    }
}
exports.ScoringEngine = ScoringEngine;
