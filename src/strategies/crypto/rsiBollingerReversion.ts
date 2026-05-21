import { Candle, bollingerBands, ema, isBullishConfirmation, rsi, round2 } from '../../utils/indicators';
import { StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:crypto_rsi_bollinger_reversion');
const debug = config.crypto.debugSignals;

export class CryptoRSIBollingerReversionStrategy {
  slug = 'crypto_rsi_bollinger_reversion';
  name = 'RSI + Bollinger Mean Reversion';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: RSI + Bollinger Mean Reversion', { ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 40) {
      if (debug) log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const closes = candles.map((c) => c.close);
    const rsiArr = rsi(closes, 14);
    const bb = bollingerBands(closes, 20, 2);
    if (rsiArr.length === 0 || bb.lower.length === 0) {
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const currentRsi = rsiArr[rsiArr.length - 1];
    const lastClose = closes[closes.length - 1];
    const lowerBand = bb.lower[bb.lower.length - 1];

    if (currentRsi > 35) {
      if (debug) log.debug('[NO_SIGNAL] RSI not oversold', { ticker, timeframe, currentRsi });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    if (lastClose > lowerBand * 1.005) {
      if (debug) log.debug('[NO_SIGNAL] price not near lower band', { ticker, timeframe, lastClose, lowerBand });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const lastCandle = candles[candles.length - 1];
    const candleRange = Math.max(lastCandle.high - lastCandle.low, 0);
    const candleBody = Math.abs(lastCandle.close - lastCandle.open);
    const hasConfirmationTolerance =
      isBullishConfirmation(lastCandle) ||
      lastCandle.close >= lastCandle.open * 0.998 ||
      (candleRange > 0 && candleBody >= candleRange * 0.3);

    log.debug('[RELAXED_FILTER] confirmation tolerance active', {
      ticker,
      timeframe,
      close: lastCandle.close,
      open: lastCandle.open,
      candleRange,
      candleBody,
      passed: hasConfirmationTolerance,
    });

    if (!hasConfirmationTolerance) {
      if (debug) log.debug('[NO_SIGNAL] no bullish reversal candle', { ticker, timeframe });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const entry = round2(lastCandle.close);
    const stopLoss = round2(lastCandle.low);
    const risk = entry - stopLoss;
    if (risk <= 0) return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };

    const takeProfit1 = round2(entry + risk * 2.3);
    const takeProfit2 = round2(entry + risk * 3.3);
    const confidence = Math.min(100, 58 + (35 - currentRsi) * 0.5);
    const rr = round2((takeProfit1 - entry) / risk);

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
