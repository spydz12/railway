import { Candle, averageVolume, round2 } from '../../utils/indicators';
import { StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:crypto_vwap_reclaim');
const debug = config.crypto.debugSignals;

export class CryptoVWAPReclaimStrategy {
  slug = 'crypto_vwap_reclaim';
  name = 'VWAP Crypto Reclaim';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: VWAP Crypto Reclaim', { ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 40) {
      if (debug) log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    const cumulative = candles.reduce((acc, candle) => {
      const typical = (candle.high + candle.low + candle.close) / 3;
      return {
        volume: acc.volume + candle.volume,
        volumePrice: acc.volumePrice + candle.volume * typical,
      };
    }, { volume: 0, volumePrice: 0 });

    const vwap = cumulative.volume > 0 ? cumulative.volumePrice / cumulative.volume : last.close;
    const flushedBelow = prev.low < vwap * 0.99;
    const reclaimed = last.close > vwap;

    if (!flushedBelow || !reclaimed) {
      if (debug) log.debug('[NO_SIGNAL] reclaim conditions not met', { ticker, timeframe, flushedBelow, reclaimed, vwap, lastClose: last.close });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const avgVol = averageVolume(candles.slice(0, -1), 20);
    if (avgVol <= 0 || last.volume < avgVol * 1.9) {
      if (debug) log.debug('[NO_SIGNAL] reclaim volume weak', { ticker, timeframe, lastVolume: last.volume, avgVol });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const entry = round2(last.close);
    const stopLoss = round2(Math.min(prev.low, vwap * 0.985));
    const risk = entry - stopLoss;
    if (risk <= 0) return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };

    const tp1 = round2(entry + risk * 2.3);
    const tp2 = round2(entry + risk * 3.4);
    const confidence = Math.min(100, 62 + (last.volume / avgVol > 2 ? 12 : 6));
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
      reasons: ['flush below VWAP', 'reclaim above VWAP', 'strong bounce volume'],
      timeframe,
      volumeConfirmation: last.volume >= avgVol * 1.9,
      marketCondition: 'bullish',
    };
  }
}
