"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateBtcTrendBias = calculateBtcTrendBias;
const indicators_1 = require("../../utils/indicators");
const logger_1 = require("../../utils/logger");
const log = (0, logger_1.createComponentLogger)('strategy:crypto_btc_leader_filter');
function calculateBtcTrendBias(candles) {
    const closes = candles.map((c) => c.close);
    const ema21 = (0, indicators_1.ema)(closes, 21);
    const ema50 = (0, indicators_1.ema)(closes, 50);
    if (ema21.length < 2 || ema50.length < 2) {
        return {
            trend: 'neutral',
            adjustment: 0,
            reason: 'Insufficient BTC market bias data',
            volatility: 'normal',
        };
    }
    const currentEma21 = ema21[ema21.length - 1];
    const currentEma50 = ema50[ema50.length - 1];
    const volatilityScore = (0, indicators_1.volatility)(candles, 20);
    const volatilityLabel = volatilityScore > 2.5 ? 'high' : volatilityScore < 1.2 ? 'low' : 'normal';
    if (currentEma21 > currentEma50 * 1.01) {
        return {
            trend: 'bullish',
            adjustment: 8,
            reason: 'BTC trend is bullish; boosting altcoin LONG confidence',
            volatility: volatilityLabel,
        };
    }
    if (currentEma21 < currentEma50 * 0.99) {
        return {
            trend: 'bearish',
            adjustment: -10,
            reason: 'BTC trend is bearish; reducing altcoin LONG confidence',
            volatility: volatilityLabel,
        };
    }
    return {
        trend: 'ranging',
        adjustment: 0,
        reason: 'BTC is ranging; favoring mean reversion and caution on breakouts',
        volatility: volatilityLabel,
    };
}
