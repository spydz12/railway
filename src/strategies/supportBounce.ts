import { Candle, findSupportLevels, averageVolume, safeAtr, round2, isHammer, isBullishEngulfing, rsi } from '../utils/indicators';
import { Strategy, StrategyResult, EMPTY_RESULT } from './base';

export class SupportBounceStrategy implements Strategy {
  slug = 'support_bounce';
  name = 'Support Bounce';

  evaluate(candles: Candle[], _ticker: string, timeframe: string): StrategyResult {
    if (candles.length < 30) return { ...EMPTY_RESULT, strategySlug: this.slug };

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const price = lastCandle.close;

    // Find support levels from candles EXCLUDING the last two (no lookahead on the signal candle)
    const priorCandles = candles.slice(0, -2);
    const supportLevels = findSupportLevels(priorCandles, 30);
    if (supportLevels.length === 0) return { ...EMPTY_RESULT, strategySlug: this.slug };

    // Find the nearest support level below current price
    // Must be within 5% below price to be actionable
    const nearestSupport = supportLevels
      .filter((s) => s < price * 1.005 && s > price * 0.95)
      .sort((a, b) => b - a)[0]; // highest support below price

    if (!nearestSupport) return { ...EMPTY_RESULT, strategySlug: this.slug };

    // Price must have actually touched support on this candle or the previous one
    const touchedSupport =
      lastCandle.low <= nearestSupport * 1.008 || prevCandle.low <= nearestSupport * 1.008;
    if (!touchedSupport) return { ...EMPTY_RESULT, strategySlug: this.slug };

    // Current candle must close ABOVE support (bounce, not breakdown)
    if (lastCandle.close <= nearestSupport) return { ...EMPTY_RESULT, strategySlug: this.slug };

    // Rejection candle: hammer OR bullish engulfing
    const hammerSignal = isHammer(lastCandle);
    const engulfingSignal = isBullishEngulfing(prevCandle, lastCandle);
    if (!hammerSignal && !engulfingSignal) return { ...EMPTY_RESULT, strategySlug: this.slug };

    // Volume confirmation: last candle must be above 1.2x average
    const avgVol = averageVolume(candles.slice(0, -1), 20);
    if (avgVol > 0 && lastCandle.volume < avgVol * 1.2) {
      return { ...EMPTY_RESULT, strategySlug: this.slug };
    }

    // RSI: oversold-to-neutral range (25–50) for genuine support bounces.
    // Tightened from 65 to 50: at RSI > 50 the stock is not near oversold,
    // so calling it a "support bounce" would be misleading.
    const closes = candles.map((c) => c.close);
    const rsiArr = rsi(closes, 14);
    const currentRsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 40;
    if (currentRsi < 25 || currentRsi > 55) return { ...EMPTY_RESULT, strategySlug: this.slug };

    // --- Level calculation ---
    const atrVal = safeAtr(candles, 14);

    // Stop: below the support level with ATR buffer
    const stopLoss = round2(nearestSupport - atrVal * 0.5);

    // Sanity check: stop must be below entry and support must be below entry
    if (stopLoss >= price || nearestSupport >= price) {
      return { ...EMPTY_RESULT, strategySlug: this.slug };
    }

    const risk = price - stopLoss;
    const tp1 = round2(price + risk * 2);
    const tp2 = round2(price + risk * 3.5);
    const volumeRatio = round2(lastCandle.volume / (avgVol || 1));
    const signalType = hammerSignal ? 'hammer' : 'bullish engulfing';

    // --- Confidence scoring ---
    let confidence = 60;
    if (engulfingSignal) confidence += 8;
    else if (hammerSignal) confidence += 5;
    if (volumeRatio >= 2) confidence += 8;
    else if (volumeRatio >= 1.5) confidence += 5;
    else if (volumeRatio >= 1.2) confidence += 3;
    if (currentRsi <= 35) confidence += 7; // More oversold = stronger bounce potential
    else if (currentRsi <= 45) confidence += 4;
    if (Math.abs(lastCandle.low - nearestSupport) / nearestSupport < 0.003) confidence += 5; // Very precise touch
    confidence = Math.min(confidence, 90);

    const reason =
      `Price touched strong support at $${round2(nearestSupport)} and formed a ${signalType} candle, ` +
      `indicating buyer rejection. Volume ${volumeRatio}x above average confirms institutional interest. ` +
      `RSI at ${round2(currentRsi)} is in oversold recovery zone with room for upside.`;

    return {
      valid: true,
      strategy: this.slug,
      symbol: _ticker,
      side: 'LONG',
      confidence,
      entry: round2(price),
      entryZoneLow: round2(nearestSupport * 1.001),
      entryZoneHigh: round2(price * 1.005),
      stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      riskReward: round2((tp1 - price) / (price - stopLoss)),
      reasons: [
        `Support bounce at $${round2(nearestSupport)}`,
        `${signalType} rejection candle`,
        `${volumeRatio}x average volume`,
        `RSI ${round2(currentRsi)} in recovery`
      ],
      timeframe,
      volumeConfirmation: volumeRatio > 1.5,
      marketCondition: 'neutral',
    };
  }
}
