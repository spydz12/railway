"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BreakoutVolumeStrategy = void 0;
const indicators_1 = require("../utils/indicators");
const base_1 = require("./base");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const log = (0, logger_1.createComponentLogger)('strategy:breakout_volume');
const debug = config_1.config.scanner.debugSignals;
class BreakoutVolumeStrategy {
    constructor() {
        this.slug = 'breakout_volume';
        this.name = 'Breakout + Volume';
    }
    evaluate(candles, _ticker, timeframe) {
        if (debug) {
            log.debug('[STRATEGY] Running: Breakout + Volume', { ticker: _ticker, timeframe, candleCount: candles.length });
        }
        if (candles.length < 30) {
            if (debug) {
                log.debug('[NO_SIGNAL] Breakout + Volume - insufficient candles', { ticker: _ticker, timeframe, candleCount: candles.length });
            }
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        }
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];
        const price = lastCandle.close;
        // Find resistance levels from candles EXCLUDING the current candle (no lookahead)
        const priorCandles = candles.slice(0, -1);
        const resistanceLevels = (0, indicators_1.findResistanceLevels)(priorCandles, 30);
        if (resistanceLevels.length === 0)
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        // Select the highest resistance level that was just broken:
        // - Must be strictly below the current close (we broke above it)
        // - Must be above the previous close (we broke it on THIS candle)
        // - Must be within 5% below current price (otherwise it's an old/irrelevant level)
        const brokenResistance = resistanceLevels
            .filter((r) => r < price && r >= price * 0.95 && r > prevCandle.close * 0.995)
            .sort((a, b) => b - a)[0]; // take the HIGHEST broken level (most recent breakout)
        if (!brokenResistance) {
            if (debug) {
                log.debug('[NO_SIGNAL] Breakout + Volume - no valid broken resistance', { ticker: _ticker, timeframe, price, resistanceLevels });
            }
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        }
        // --- Breakout candle validation ---
        // Candle must have closed above resistance
        const closedAboveResistance = lastCandle.close > brokenResistance;
        if (!closedAboveResistance)
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        // Account for gap-up breakouts: the open may be above resistance (gap) OR
        // the candle may have opened below and broken through intraday.
        const openedAtOrNearResistance = lastCandle.open <= brokenResistance * 1.03;
        if (!openedAtOrNearResistance) {
            if (debug) {
                log.debug('[NO_SIGNAL] Breakout + Volume - open too far above resistance', { ticker: _ticker, timeframe, lastOpen: lastCandle.open, brokenResistance });
            }
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        }
        // Volume confirmation: spike ≥ 1.5x 20-period average
        const avgVol = (0, indicators_1.averageVolume)(priorCandles, 20);
        if (avgVol === 0) {
            if (debug) {
                log.debug('[NO_SIGNAL] Breakout + Volume - avgVol zero', { ticker: _ticker, timeframe });
            }
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        }
        const volumeRatio = lastCandle.volume / avgVol;
        if (volumeRatio < 1.5) {
            if (debug) {
                log.debug('[NO_SIGNAL] Breakout + Volume - volume ratio too low', { ticker: _ticker, timeframe, volumeRatio, avgVol, lastVolume: lastCandle.volume });
            }
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        }
        // Candle quality: must close in upper 50% of its range
        const candleRange = lastCandle.high - lastCandle.low;
        const closePct = candleRange > 0 ? (lastCandle.close - lastCandle.low) / candleRange : 0;
        if (closePct < 0.5)
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        // RSI: should be in bullish but not extreme overbought territory
        const closes = candles.map((c) => c.close);
        const rsiArr = (0, indicators_1.rsi)(closes, 14);
        const currentRsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
        if (currentRsi > 80) {
            if (debug) {
                log.debug('[NO_SIGNAL] Breakout + Volume - RSI overbought', { ticker: _ticker, timeframe, currentRsi });
            }
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        }
        // --- Level calculation ---
        const atrVal = (0, indicators_1.safeAtr)(candles, 14);
        // Stop: just below the breakout resistance level (with ATR buffer)
        // Use the LOWER of (resistance - small buffer) and (candle low - buffer)
        // to place stop below the breakout level
        const stopLoss = (0, indicators_1.round2)(Math.min(brokenResistance - atrVal * 0.3, lastCandle.low - atrVal * 0.1));
        // Sanity check: stop must be below entry
        if (stopLoss >= price)
            return { ...base_1.EMPTY_RESULT, strategySlug: this.slug };
        const risk = price - stopLoss;
        const tp1 = (0, indicators_1.round2)(price + risk * 2);
        const tp2 = (0, indicators_1.round2)(price + risk * 3);
        // --- Confidence scoring ---
        let confidence = 65;
        if (volumeRatio >= 3)
            confidence += 12;
        else if (volumeRatio >= 2)
            confidence += 8;
        else if (volumeRatio >= 1.5)
            confidence += 4;
        if (closePct >= 0.75)
            confidence += 6;
        else if (closePct >= 0.6)
            confidence += 3;
        if (currentRsi >= 55 && currentRsi <= 70)
            confidence += 5;
        if (lastCandle.open <= brokenResistance)
            confidence += 4; // Clean intraday breakout (not gap-up)
        confidence = Math.min(confidence, 95);
        const result = {
            valid: true,
            strategy: this.slug,
            symbol: _ticker,
            side: 'LONG',
            confidence,
            entry: (0, indicators_1.round2)(price),
            entryZoneLow: (0, indicators_1.round2)(brokenResistance),
            entryZoneHigh: (0, indicators_1.round2)(price * 1.002),
            stopLoss,
            takeProfit1: tp1,
            takeProfit2: tp2,
            riskReward: (0, indicators_1.round2)((tp1 - price) / (price - stopLoss)),
            reasons: [
                `Breakout above resistance at $${(0, indicators_1.round2)(brokenResistance)}`,
                `${(0, indicators_1.round2)(volumeRatio)}x average volume`,
                `Strong close in upper ${(0, indicators_1.round2)(closePct * 100)}% of range`,
                `RSI ${(0, indicators_1.round2)(currentRsi)} supports momentum`
            ],
            timeframe,
            volumeConfirmation: volumeRatio > 1.5,
            marketCondition: 'bullish',
        };
        if (debug) {
            log.debug('[RESULT] Breakout + Volume', {
                ticker: _ticker,
                timeframe,
                brokenResistance,
                price,
                volumeRatio,
                closePct,
                currentRsi,
                stopLoss,
                tp1,
                tp2,
                riskReward: result.riskReward,
                confidence: result.confidence,
                reasons: result.reasons,
            });
        }
        return result;
    }
}
exports.BreakoutVolumeStrategy = BreakoutVolumeStrategy;
