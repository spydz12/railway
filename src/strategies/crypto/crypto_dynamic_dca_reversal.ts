import { Candle, averageVolume, bollingerBands, ema, isBullishEngulfing, isHammer, round2, rsi, safeAtr } from '../../utils/indicators';
import { Strategy, StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:crypto_dynamic_dca_reversal');
const debug = config.crypto.debugSignals;

export class CryptoDynamicDcaReversalStrategy implements Strategy {
  slug = 'crypto_dynamic_dca_reversal';
  name = 'Dynamic DCA Reversal';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: Dynamic DCA Reversal', { ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 60) {
      if (debug) log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const closes = candles.map((c) => c.close);
    const rsiArr = rsi(closes, 14);
    const bb = bollingerBands(closes, 20, 2);
    if (rsiArr.length === 0 || bb.lower.length === 0) {
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const currentRsi = rsiArr[rsiArr.length - 1];
    const lowerBand = bb.lower[bb.lower.length - 1];

    if (currentRsi >= 30) {
      if (debug) log.debug('[NO_SIGNAL] rsi not oversold', { ticker, timeframe, currentRsi });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    if (last.close > lowerBand * 1.005) {
      if (debug) log.debug('[NO_SIGNAL] price not at lower bollinger', { ticker, timeframe, close: last.close, lowerBand });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const avgVol = averageVolume(candles.slice(0, -1), 20);
    const relativeVolume = avgVol > 0 ? last.volume / avgVol : 0;
    if (relativeVolume < 1.5) {
      if (debug) log.debug('[NO_SIGNAL] volume spike missing', { ticker, timeframe, relativeVolume });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const hasReversalPattern = isBullishEngulfing(prev, last) || isHammer(last);
    if (!hasReversalPattern) {
      if (debug) log.debug('[NO_SIGNAL] no reversal candle pattern', { ticker, timeframe });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const ema21 = ema(closes, 21);
    const ema50 = ema(closes, 50);
    if (ema21.length === 0 || ema50.length === 0) {
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const strongDowntrend =
      ema21[ema21.length - 1] < ema50[ema50.length - 1] * 0.985 &&
      last.close < ema21[ema21.length - 1];
    if (strongDowntrend) {
      if (debug) log.debug('[NO_SIGNAL] strong downtrend active', { ticker, timeframe });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const atrVal = safeAtr(candles, 14);
    const entry = round2(last.close);
    const stopLoss = round2(Math.min(last.low, prev.low));
    const risk = entry - stopLoss;
    if (risk <= 0) return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };

    const takeProfit1 = round2(entry + Math.max(risk * 2.1, atrVal * 2.1));
    const takeProfit2 = round2(entry + Math.max(risk * 3.1, atrVal * 3));

    let confidence = 70;
    if (currentRsi < 25) confidence += 8;
    if (relativeVolume > 2) confidence += 7;
    if (isBullishEngulfing(prev, last)) confidence += 5;

    log.info('[SIGNAL] DCA reversal setup', {
      ticker,
      timeframe,
      currentRsi,
      relativeVolume,
      lowerBand,
      close: last.close,
      hasReversalPattern,
    });

    const result: StrategyResult = {
      valid: true,
      strategy: this.slug,
      symbol: ticker,
      side: 'LONG',
      confidence: Math.min(90, confidence),
      entry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward: round2((takeProfit1 - entry) / risk),
      reasons: ['oversold condition', 'lower band touch', 'volume spike', 'bullish reversal pattern'],
      timeframe,
      volumeConfirmation: relativeVolume > 1.5,
      marketCondition: 'reversal',
    };

    log.info('[RESULT] Strategy evaluated', {
      ticker,
      timeframe,
      strategy: this.slug,
      valid: result.valid,
      side: result.side,
      confidence: result.confidence,
    });

    return result;
  }
}
