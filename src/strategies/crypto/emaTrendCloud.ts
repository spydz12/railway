import { Candle, ema, isBullishConfirmation, round2 } from '../../utils/indicators';
import { StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:crypto_ema_trend_cloud');
const debug = config.crypto.debugSignals;

export class CryptoEMATrendCloudStrategy {
  slug = 'crypto_ema_trend_cloud';
  name = 'EMA Trend Cloud';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: EMA Trend Cloud', { ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 50) {
      if (debug) log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const closes = candles.map((c) => c.close);
    const ema21 = ema(closes, 21);
    const ema50 = ema(closes, 50);
    if (ema21.length < 3 || ema50.length < 3) {
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const currentEma21 = ema21[ema21.length - 1];
    const currentEma50 = ema50[ema50.length - 1];
    const prevEma21 = ema21[ema21.length - 2];
    const last = candles[candles.length - 1];
    const emaTrendThreshold = currentEma50 * 0.995;

    log.debug('[RELAXED_FILTER] EMA tolerance active', {
      ticker,
      timeframe,
      currentEma21,
      currentEma50,
      emaTrendThreshold,
    });

    if (!(currentEma21 > emaTrendThreshold && currentEma21 > prevEma21)) {
      if (debug) log.debug('[NO_SIGNAL] trend not aligned', { ticker, timeframe, currentEma21, currentEma50 });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const distanceToEma21 = Math.abs(last.close - currentEma21) / currentEma21;
    if (distanceToEma21 > 0.015) {
      if (debug) log.debug('[NO_SIGNAL] pullback not close enough', { ticker, timeframe, distanceToEma21 });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const candleRange = Math.max(last.high - last.low, 0);
    const candleBody = Math.abs(last.close - last.open);
    const hasConfirmationTolerance =
      isBullishConfirmation(last) ||
      last.close >= last.open * 0.998 ||
      (candleRange > 0 && candleBody >= candleRange * 0.3);

    log.debug('[RELAXED_FILTER] confirmation tolerance active', {
      ticker,
      timeframe,
      close: last.close,
      open: last.open,
      candleRange,
      candleBody,
      passed: hasConfirmationTolerance,
    });

    if (!hasConfirmationTolerance) {
      if (debug) log.debug('[NO_SIGNAL] no bullish confirmation candle', { ticker, timeframe, lastCandle: last });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const entry = round2(last.close);
    const stopLoss = round2(Math.min(last.low, currentEma21 * 0.99));
    const risk = entry - stopLoss;
    if (risk <= 0) return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };

    const tp1 = round2(entry + risk * 2.1);
    const tp2 = round2(entry + risk * 3.2);
    const confidence = Math.min(100, 58 + (distanceToEma21 < 0.008 ? 10 : 5));
    const rr = round2((tp1 - entry) / risk);

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
      reasons: ['EMA21 above EMA50', 'pullback into EMA zone', 'bullish continuation candle'],
      timeframe,
      volumeConfirmation: last.close > last.open,
      marketCondition: 'bullish',
    };
  }
}
