"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoRSIBollingerReversionStrategy = void 0;
const indicators_1 = require("../../utils/indicators");
const base_1 = require("../base");
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const log = (0, logger_1.createComponentLogger)('strategy:crypto_rsi_bollinger_reversion');
const debug = config_1.config.crypto.debugSignals;
class CryptoRSIBollingerReversionStrategy {
    constructor() {
        this.slug = 'crypto_rsi_bollinger_reversion';
        this.name = 'RSI + Bollinger Mean Reversion';
    }
    evaluate(candles, ticker, timeframe) {
        if (debug) {
            log.debug('[STRATEGY] Running: RSI + Bollinger Mean Reversion', { ticker, timeframe, candleCount: candles.length });
        }
        if (candles.length < 40) {
            if (debug)
                log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const closes = candles.map((c) => c.close);
        const rsiArr = (0, indicators_1.rsi)(closes, 14);
        const bb = (0, indicators_1.bollingerBands)(closes, 20, 2);
        if (rsiArr.length === 0 || bb.lower.length === 0) {
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const currentRsi = rsiArr[rsiArr.length - 1];
        const lastClose = closes[closes.length - 1];
        const lowerBand = bb.lower[bb.lower.length - 1];
        if (currentRsi > 35) {
            if (debug)
                log.debug('[NO_SIGNAL] RSI not oversold', { ticker, timeframe, currentRsi });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        if (lastClose > lowerBand * 1.005) {
            if (debug)
                log.debug('[NO_SIGNAL] price not near lower band', { ticker, timeframe, lastClose, lowerBand });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const lastCandle = candles[candles.length - 1];
        const candleRange = Math.max(lastCandle.high - lastCandle.low, 0);
        const candleBody = Math.abs(lastCandle.close - lastCandle.open);
        const hasConfirmationTolerance = (0, indicators_1.isBullishConfirmation)(lastCandle) ||
            lastCandle.close >= lastCandle.open * 0.998 ||
            (candleRange > 0 && candleBody >= candleRange * 0.3);
        log.info('[RELAXED_FILTER] confirmation tolerance active', {
            ticker,
            timeframe,
            close: lastCandle.close,
            open: lastCandle.open,
            candleRange,
            candleBody,
            passed: hasConfirmationTolerance,
        });
        if (!hasConfirmationTolerance) {
            if (debug)
                log.debug('[NO_SIGNAL] no bullish reversal candle', { ticker, timeframe });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const entry = (0, indicators_1.round2)(lastCandle.close);
        const stopLoss = (0, indicators_1.round2)(lastCandle.low);
        const risk = entry - stopLoss;
        if (risk <= 0)
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        const takeProfit1 = (0, indicators_1.round2)(entry + risk * 2.3);
        const takeProfit2 = (0, indicators_1.round2)(entry + risk * 3.3);
        const confidence = Math.min(100, 58 + (35 - currentRsi) * 0.5);
        const rr = (0, indicators_1.round2)((takeProfit1 - entry) / risk);
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
            reasons: ['oversold RSI', 'Bollinger lower band touch', 'reversal confirmation candle'],
            timeframe,
            volumeConfirmation: lastCandle.volume > 0,
            marketCondition: 'bullish',
        };
    }
}
exports.CryptoRSIBollingerReversionStrategy = CryptoRSIBollingerReversionStrategy;
