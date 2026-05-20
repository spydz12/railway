import { Candle, ema, rsi, safeAtr, round2, isBullishConfirmation, averageVolume } from '../utils/indicators';
import { Strategy, StrategyResult, EMPTY_RESULT } from './base';
import { createComponentLogger } from '../utils/logger';
import { config } from '../config';

const log = createComponentLogger('strategy:trend_pullback');
const debug = config.scanner.debugSignals;

export class TrendPullbackStrategy implements Strategy {
  slug = 'trend_pullback';
  name = 'Trend Pullback';

  evaluate(candles: Candle[], _ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: Trend Pullback', { ticker: _ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 60) {
      if (debug) {
        log.debug('[NO_SIGNAL] Trend Pullback - insufficient candles', { ticker: _ticker, timeframe, candleCount: candles.length });
      }
      return { ...EMPTY_RESULT, strategySlug: this.slug };
    }

    const closes = candles.map((c) => c.close);
    const ema20Arr = ema(closes, 20);
    const ema50Arr = ema(closes, 50);
    const rsiArr = rsi(closes, 14);

    if (ema20Arr.length < 3 || ema50Arr.length < 3 || rsiArr.length < 3) {
      return { ...EMPTY_RESULT, strategySlug: this.slug };
    }

    const currentEma20 = ema20Arr[ema20Arr.length - 1];
    const prevEma20 = ema20Arr[ema20Arr.length - 2];
    const currentEma50 = ema50Arr[ema50Arr.length - 1];
    const currentRsi = rsiArr[rsiArr.length - 1];
    const prevRsi = rsiArr[rsiArr.length - 2];

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];
    const price = lastCandle.close;

    // --- Core conditions ---

    // 1. Uptrend: EMA20 > EMA50, both trending up
    const trendUp = currentEma20 > currentEma50;
    const ema20Sloping = currentEma20 > prevEma20;
    if (!trendUp || !ema20Sloping) {
      if (debug) {
        log.debug('[NO_SIGNAL] Trend Pullback - trend not aligned', { ticker: _ticker, timeframe, currentEma20, currentEma50, prevEma20, trendUp, ema20Sloping });
      }
      return { ...EMPTY_RESULT, strategySlug: this.slug };
    }

    // 2. Pullback: price is within 1% of EMA20 (tightened from 2% to reduce noise)
    const distanceFromEma20 = Math.abs(price - currentEma20) / currentEma20;
    const pullbackNearEma20 = distanceFromEma20 < 0.01;
    if (!pullbackNearEma20) {
      if (debug) {
        log.debug('[NO_SIGNAL] Trend Pullback - pullback too wide', { ticker: _ticker, timeframe, distanceFromEma20 });
      }
      return { ...EMPTY_RESULT, strategySlug: this.slug };
    }

    // 3. RSI: bullish zone, not overbought
    const rsiInRange = currentRsi > 50 && currentRsi < 70;
    if (!rsiInRange) {
      if (debug) {
        log.debug('[NO_SIGNAL] Trend Pullback - RSI out of range', { ticker: _ticker, timeframe, currentRsi });
      }
      return { ...EMPTY_RESULT, strategySlug: this.slug };
    }

    // 4. Confirmation candle: closes bullish in upper 60% of range
    if (!isBullishConfirmation(lastCandle)) {
      if (debug) {
        log.debug('[NO_SIGNAL] Trend Pullback - confirmation candle failed', { ticker: _ticker, timeframe, lastCandle });
      }
      return { ...EMPTY_RESULT, strategySlug: this.slug };
    }

    // 5. Volume: last candle should have at least 80% of 20-period average (not dead volume)
    const avgVol = averageVolume(candles.slice(0, -1), 20);
    if (avgVol > 0 && lastCandle.volume < avgVol * 0.8) {
      if (debug) {
        log.debug('[NO_SIGNAL] Trend Pullback - low volume', { ticker: _ticker, timeframe, volume: lastCandle.volume, avgVol });
      }
      return { ...EMPTY_RESULT, strategySlug: this.slug };
    }

    // --- Level calculation ---
    const atrVal = safeAtr(candles, 14);
    const stopLoss = round2(Math.min(prevCandle.low - atrVal * 0.2, currentEma20 - atrVal * 0.5));

    // Sanity check: stop must be below entry
    if (stopLoss >= price) return { ...EMPTY_RESULT, strategySlug: this.slug };

    const risk = price - stopLoss;
    const tp1 = round2(price + risk * 2);
    const tp2 = round2(price + risk * 3.5);

    // Entry zone: tight band around EMA20, must contain the current price
    const entryZoneLow = round2(Math.min(price * 0.999, currentEma20 * 0.998));
    const entryZoneHigh = round2(Math.max(price * 1.001, currentEma20 * 1.003));

    // --- Confidence scoring ---
    let confidence = 60;
    if (rsiArr[rsiArr.length - 1] > prevRsi) confidence += 5; // RSI turning up
    if (currentRsi < 65) confidence += 5;                     // Room before overbought
    if (currentEma20 > currentEma50 * 1.01) confidence += 5;  // Clear trend separation
    if (lastCandle.volume > avgVol) confidence += 5;           // Above-avg volume
    if (distanceFromEma20 < 0.005) confidence += 5;           // Very tight pullback
    if (risk / atrVal > 0.8) confidence += 5;                  // Meaningful risk relative to ATR
    confidence = Math.min(confidence, 92);

    const reason =
      `EMA20 (${round2(currentEma20)}) above EMA50 (${round2(currentEma50)}) confirming uptrend. ` +
      `Price pulled back ${round2(distanceFromEma20 * 100)}% to EMA20 with RSI at ${round2(currentRsi)}. ` +
      `Bullish confirmation candle with adequate volume. Setup targets trend continuation.`;

    return {
      valid: true,
      strategy: this.slug,
      symbol: _ticker,
      side: 'LONG',
      confidence,
      entry: round2(price),
      entryZoneLow,
      entryZoneHigh,
      stopLoss,
      takeProfit1: tp1,
      takeProfit2: tp2,
      riskReward: round2((tp1 - price) / (price - stopLoss)),
      reasons: [
        `EMA20 > EMA50 (${round2(currentEma20)} > ${round2(currentEma50)})`,
        `${round2(distanceFromEma20 * 100)}% pullback to EMA20`,
        `RSI ${round2(currentRsi)} with room to run`,
        `Bullish confirmation candle`
      ],
      timeframe,
      volumeConfirmation: lastCandle.volume > avgVol,
      marketCondition: 'bullish',
    };
  }
}
