"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoLiquiditySweepReversalStrategy = void 0;
const indicators_1 = require("../../utils/indicators");
const base_1 = require("../base");
const logger_1 = require("../../utils/logger");
const config_1 = require("../../config");
const log = (0, logger_1.createComponentLogger)('strategy:crypto_liquidity_sweep_reversal');
const debug = config_1.config.crypto.debugSignals;
class CryptoLiquiditySweepReversalStrategy {
    constructor() {
        this.slug = 'crypto_liquidity_sweep_reversal';
        this.name = 'Liquidity Sweep Reversal';
    }
    evaluate(candles, ticker, timeframe) {
        if (debug) {
            log.debug('[STRATEGY] Running: Liquidity Sweep Reversal', { ticker, timeframe, candleCount: candles.length });
        }
        if (candles.length < 40) {
            if (debug)
                log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const recent = candles.slice(-6);
        const last = recent[recent.length - 1];
        const prev = recent[recent.length - 2];
        const avgVol = (0, indicators_1.averageVolume)(candles.slice(0, -1), 20);
        const candleBody = Math.abs(last.close - last.open);
        const lowerWick = Math.min(last.open, last.close) - last.low;
        const hasHammerTolerance = (0, indicators_1.isHammer)(last) || lowerWick > candleBody * 1.5;
        log.info('[RELAXED_FILTER] confirmation tolerance active', {
            ticker,
            timeframe,
            lowerWick,
            candleBody,
            passed: hasHammerTolerance,
        });
        if (!hasHammerTolerance) {
            if (debug)
                log.debug('[NO_SIGNAL] last candle not a hammer', { ticker, timeframe });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        if (last.volume < avgVol * 1.8) {
            if (debug)
                log.debug('[NO_SIGNAL] low liquidity on sweep', { ticker, timeframe, lastVolume: last.volume, avgVol });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        if (last.close <= prev.close) {
            if (debug)
                log.debug('[NO_SIGNAL] close not reclaiming enough', { ticker, timeframe, lastClose: last.close, prevClose: prev.close });
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        }
        const entry = (0, indicators_1.round2)(last.close);
        const stopLoss = (0, indicators_1.round2)(last.low);
        const risk = entry - stopLoss;
        if (risk <= 0)
            return { ...base_1.EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
        const tp1 = (0, indicators_1.round2)(entry + risk * 2.4);
        const tp2 = (0, indicators_1.round2)(entry + risk * 3.6);
        const confidence = Math.min(100, 64 + (last.volume / avgVol > 2.5 ? 12 : 8));
        const rr = (0, indicators_1.round2)((tp1 - entry) / risk);
        return {
            valid: true,
            strategy: this.slug,
            symbol: ticker,
            side: 'LONG',
            confidence,
            entry,
            stopLoss,
            takeProfit1: tp1,
            takeProfit2: tp2,
            riskReward: rr,
            reasons: ['liquidity sweep detection', 'strong wick rejection', 'reclaim close'],
            timeframe,
            volumeConfirmation: last.volume >= avgVol * 1.8,
            marketCondition: 'bullish',
        };
    }
}
exports.CryptoLiquiditySweepReversalStrategy = CryptoLiquiditySweepReversalStrategy;
