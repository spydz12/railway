import { Candle, averageVolume, ema, round2, rsi, safeAtr } from '../../utils/indicators';
import { Strategy, StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:crypto_scalp_microbreakout');
const debug = config.crypto.debugSignals;
const ALLOWED_TIMEFRAMES = new Set(['1m', '3m', '5m']);

function averageBodySize(candles: Candle[], period = 10): number {
  const sample = candles.slice(-period);
  if (sample.length === 0) return 0;
  return sample.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / sample.length;
}

export class CryptoScalpMicroBreakoutStrategy implements Strategy {
  slug = 'crypto_scalp_microbreakout';
  name = 'Scalp Micro Breakout';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: Scalp Micro Breakout', { ticker, timeframe, candleCount: candles.length });
    }

    if (!ALLOWED_TIMEFRAMES.has(timeframe)) {
      if (debug) log.debug('[NO_SIGNAL] timeframe not supported for scalp', { ticker, timeframe });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    if (candles.length < 45) {
      if (debug) log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const closes = candles.map((c) => c.close);
    const last = candles[candles.length - 1];

    const avgVol = averageVolume(candles.slice(0, -1), 20);
    const relativeVolume = avgVol > 0 ? last.volume / avgVol : 0;
    if (relativeVolume < 1.7) {
      if (debug) log.debug('[NO_SIGNAL] volume spike missing', { ticker, timeframe, relativeVolume });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const recentHigh = Math.max(...candles.slice(-11, -1).map((c) => c.high));
    if (last.close <= recentHigh * 1.0005) {
      if (debug) log.debug('[NO_SIGNAL] micro breakout missing', { ticker, timeframe, close: last.close, recentHigh });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    if (ema9.length === 0 || ema21.length === 0 || ema9[ema9.length - 1] <= ema21[ema21.length - 1]) {
      if (debug) log.debug('[NO_SIGNAL] ema9 not above ema21', { ticker, timeframe });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const rsiArr = rsi(closes, 14);
    const rsiVal = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1] : 50;
    if (rsiVal <= 55) {
      if (debug) log.debug('[NO_SIGNAL] rsi not strong enough', { ticker, timeframe, rsiVal });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const body = Math.abs(last.close - last.open);
    const avgBody = averageBodySize(candles.slice(0, -1), 10);
    if (body <= avgBody) {
      if (debug) log.debug('[NO_SIGNAL] candle body too weak', { ticker, timeframe, body, avgBody });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const atrVal = safeAtr(candles, 14);
    const entry = round2(last.close);
    const stopLoss = round2(entry - atrVal * 0.8);
    const takeProfit1 = round2(entry + atrVal * 1.2);
    const takeProfit2 = round2(entry + atrVal * 1.8);
    const risk = entry - stopLoss;
    if (risk <= 0) return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };

    let confidence = 60;
    if (relativeVolume > 2.2) confidence += 10;
    if (rsiVal > 62) confidence += 5;
    if (body > avgBody * 1.5) confidence += 5;

    log.info('[SIGNAL] scalp breakout detected', {
      ticker,
      timeframe,
      relativeVolume,
      rsiVal,
      recentHigh,
      close: last.close,
    });

    const result: StrategyResult = {
      valid: true,
      strategy: this.slug,
      symbol: ticker,
      side: 'LONG',
      confidence: Math.min(80, confidence),
      entry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward: round2((takeProfit1 - entry) / risk),
      reasons: ['micro breakout', 'ema9 above ema21', 'rsi momentum', 'volume spike'],
      timeframe,
      volumeConfirmation: relativeVolume > 1.7,
      marketCondition: 'bullish',
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
