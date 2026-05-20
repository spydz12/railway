import { Candle, averageVolume, ema, rsi, round2, safeAtr } from '../../utils/indicators';
import { Strategy, StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:crypto_btc_market_leader');
const debug = config.crypto.debugSignals;

const BTC = 'BTCUSDT';

// Module-level cache: timeframe → BTC candles, populated by scanner before concurrent scan
const _btcCandlesByTimeframe = new Map<string, Candle[]>();
export function setBtcContextCandles(timeframe: string, candles: Candle[]): void {
  _btcCandlesByTimeframe.set(timeframe, candles);
}

function vwap(candles: Candle[]): number {
  const sample = candles.slice(-30);
  const denom = sample.reduce((sum, c) => sum + c.volume, 0);
  if (denom <= 0) return sample[sample.length - 1]?.close ?? 0;
  const numer = sample.reduce((sum, c) => sum + ((c.high + c.low + c.close) / 3) * c.volume, 0);
  return numer / denom;
}

function timeframeBias(candles: Candle[]): { bullish: boolean; weak: boolean; rsiVal: number; relVol: number; aboveVwap: boolean } {
  const closes = candles.map((c) => c.close);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const rsiArr = rsi(closes, 14);
  if (ema21.length === 0 || ema50.length === 0 || rsiArr.length === 0) {
    return { bullish: false, weak: true, rsiVal: 50, relVol: 0, aboveVwap: false };
  }

  const last = candles[candles.length - 1];
  const avgVol = averageVolume(candles.slice(0, -1), 20);
  const relVol = avgVol > 0 ? last.volume / avgVol : 0;
  const rsiVal = rsiArr[rsiArr.length - 1];
  const aboveVwap = last.close > vwap(candles);
  const bullish =
    ema21[ema21.length - 1] > ema50[ema50.length - 1] &&
    rsiVal > 50 &&
    relVol > 1 &&
    aboveVwap;
  const weak = rsiVal < 45 || ema21[ema21.length - 1] < ema50[ema50.length - 1];

  return { bullish, weak, rsiVal, relVol, aboveVwap };
}

export class CryptoBtcMarketLeaderStrategy implements Strategy {
  slug = 'crypto_btc_market_leader';
  name = 'BTC Market Leader Bias';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: BTC Market Leader Bias', { ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 55) {
      if (debug) log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    let biasCandles = candles;
    if (ticker !== BTC) {
      const cached = _btcCandlesByTimeframe.get(timeframe);
      if (!cached || cached.length < 55) {
        if (debug) log.debug('[NO_SIGNAL] BTC context unavailable', { ticker, timeframe });
        return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
      }
      biasCandles = cached;
    }

    const bias = timeframeBias(biasCandles);

    const bullishVotes = bias.bullish ? 2 : 0;
    const weakVotes = bias.weak ? 2 : 0;

    let marketBias: 'bullish' | 'neutral' | 'bearish' = 'neutral';
    if (bullishVotes >= 2) marketBias = 'bullish';
    if (weakVotes >= 2) marketBias = 'bearish';

    if (marketBias === 'neutral') {
      if (debug) log.debug('[NO_SIGNAL] BTC not leading', { ticker, timeframe, bullishVotes, weakVotes });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const last = candles[candles.length - 1];
    const atrVal = safeAtr(candles, 14);
    const side: 'LONG' | 'SHORT' = marketBias === 'bullish' ? 'LONG' : 'SHORT';
    let confidence = 60 + bullishVotes * 10;
    if (marketBias === 'bearish') confidence = 60 + weakVotes * 10;

    const entry = round2(last.close);
    const stopLoss = side === 'LONG'
      ? round2(entry - atrVal * 1.2)
      : round2(entry + atrVal * 1.2);
    const takeProfit1 = side === 'LONG'
      ? round2(entry + atrVal * 2)
      : round2(entry - atrVal * 2);
    const takeProfit2 = side === 'LONG'
      ? round2(entry + atrVal * 3)
      : round2(entry - atrVal * 3);

    const risk = Math.abs(entry - stopLoss);
    if (risk <= 0) return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };

    if (marketBias === 'bullish') {
      log.info('[SIGNAL] BTC market bias bullish', { ticker, timeframe, bullishVotes, weakVotes });
    } else {
      log.info('[SIGNAL] BTC market bias bearish', { ticker, timeframe, bullishVotes, weakVotes });
    }

    const result: StrategyResult = {
      valid: true,
      strategy: this.slug,
      symbol: ticker,
      side,
      confidence: Math.min(90, confidence),
      entry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward: round2(Math.abs(takeProfit1 - entry) / risk),
      reasons: [`btc_market_bias_${marketBias}`, 'btc multi-timeframe alignment'],
      timeframe,
      volumeConfirmation: true,
      marketCondition: marketBias,
    };

    log.info('[RESULT] Strategy evaluated', {
      ticker,
      timeframe,
      strategy: this.slug,
      valid: result.valid,
      side: result.side,
      confidence: result.confidence,
      marketBias,
    });

    return result;
  }
}
