"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoMomentumBreakoutStrategy = void 0;
const indicators_1 = require("../../utils/indicators");
const base_1 = require("../base");
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const log = (0, logger_1.createComponentLogger)('strategy:crypto_momentum_breakout');
const debug = config_1.config.crypto.debugSignals;
class CryptoMomentumBreakoutStrategy {
    constructor() {
        this.slug = 'crypto_momentum_breakout';
        this.name = 'Crypto Momentum Breakout';
    }
    evaluate(candles, ticker, timeframe) {
        if (debug) {
            log.debug('[STRATEGY] Running: Crypto Momentum Breakout', { ticker, timeframe, candleCount: candles.length });
        }
        if (candles.length < 30) {
            if (debug)
                log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const closes = candles.map((c) => c.close);
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const atr = (0, indicators_1.safeAtr)(candles, 14);
        const resistances = (0, indicators_1.findResistanceLevels)(candles, 18);
        const resistance = resistances.length > 0 ? resistances[resistances.length - 1] : 0;
        const breakoutThreshold = atr > 0 ? resistance - (atr * 0.2) : resistance * 0.998;
        log.info('[RELAXED_FILTER] Breakout tolerance active', {
            ticker,
            timeframe,
            resistance,
            atr,
            breakoutThreshold,
        });
        if (!resistance || last.close < breakoutThreshold) {
            if (debug)
                log.debug('[NO_SIGNAL] breakout not above resistance', { ticker, timeframe, lastClose: last.close, resistance, breakoutThreshold });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const breakoutStrength = (0, indicators_1.percentChange)(resistance, last.close);
        if (breakoutStrength < 0.75) {
            if (debug)
                log.debug('[NO_SIGNAL] weak breakout strength', { ticker, timeframe, breakoutStrength });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const candleRange = Math.max(last.high - last.low, 0);
        const candleBody = Math.abs(last.close - last.open);
        const hasConfirmationTolerance = (0, indicators_1.isBullishConfirmation)(last) ||
            last.close >= last.open * 0.998 ||
            (candleRange > 0 && candleBody >= candleRange * 0.3);
        log.info('[RELAXED_FILTER] confirmation tolerance active', {
            ticker,
            timeframe,
            close: last.close,
            open: last.open,
            candleRange,
            candleBody,
            passed: hasConfirmationTolerance,
        });
        if (!hasConfirmationTolerance) {
            if (debug)
                log.debug('[NO_SIGNAL] no bullish confirmation candle', { ticker, timeframe, lastCandle: last });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const avgVol = (0, indicators_1.averageVolume)(candles.slice(0, -1), 20);
        if (avgVol <= 0 || last.volume < avgVol * 1.8) {
            if (debug)
                log.debug('[NO_SIGNAL] volume not strong enough', { ticker, timeframe, lastVolume: last.volume, avgVol });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const stopLoss = (0, indicators_1.round2)(Math.min(prev.low, resistance * 0.995));
        const entry = (0, indicators_1.round2)(last.close);
        const risk = entry - stopLoss;
        if (risk <= 0)
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        const takeProfit1 = (0, indicators_1.round2)(entry + risk * 2.2);
        const takeProfit2 = (0, indicators_1.round2)(entry + risk * 3.5);
        const rr = (0, indicators_1.round2)((takeProfit1 - entry) / risk);
        const confidence = Math.min(100, 60 + breakoutStrength * 10 + (last.volume / avgVol > 2 ? 10 : 0));
        const reasons = [
            'breakout above resistance',
            'strong relative volume',
            'bullish confirmation candle',
        ];
        return {
            valid: true,
            strategy: this.slug,
            symbol: ticker,
            side: 'LONG',
            confidence,
            entry,
            stopLoss,
            takeProfit1,
            takeProfit2,
            riskReward: rr,
            reasons,
            timeframe,
            volumeConfirmation: last.volume >= avgVol * 1.8,
            marketCondition: 'bullish',
        };
    }
}
exports.CryptoMomentumBreakoutStrategy = CryptoMomentumBreakoutStrategy;
