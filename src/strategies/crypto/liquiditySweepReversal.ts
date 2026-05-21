import { Candle, averageVolume, isHammer, round2 } from '../../utils/indicators';
import { StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:crypto_liquidity_sweep_reversal');
const debug = config.crypto.debugSignals;

export class CryptoLiquiditySweepReversalStrategy {
  slug = 'crypto_liquidity_sweep_reversal';
  name = 'Liquidity Sweep Reversal';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: Liquidity Sweep Reversal', { ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 40) {
      if (debug) log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const recent = candles.slice(-6);
    const last = recent[recent.length - 1];
    const prev = recent[recent.length - 2];
    const avgVol = averageVolume(candles.slice(0, -1), 20);

    const candleBody = Math.abs(last.close - last.open);
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const hasHammerTolerance = isHammer(last) || lowerWick > candleBody * 1.5;

    log.debug('[RELAXED_FILTER] confirmation tolerance active', {
      ticker,
      timeframe,
      lowerWick,
      candleBody,
      passed: hasHammerTolerance,
    });

    if (!hasHammerTolerance) {
      if (debug) log.debug('[NO_SIGNAL] last candle not a hammer', { ticker, timeframe });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    if (last.volume < avgVol * 1.8) {
      if (debug) log.debug('[NO_SIGNAL] low liquidity on sweep', { ticker, timeframe, lastVolume: last.volume, avgVol });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    if (last.close <= prev.close) {
      if (debug) log.debug('[NO_SIGNAL] close not reclaiming enough', { ticker, timeframe, lastClose: last.close, prevClose: prev.close });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const entry = round2(last.close);
    const stopLoss = round2(last.low);
    const risk = entry - stopLoss;
    if (risk <= 0) return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };

    const tp1 = round2(entry + risk * 2.4);
    const tp2 = round2(entry + risk * 3.6);
    const confidence = Math.min(100, 64 + (last.volume / avgVol > 2.5 ? 12 : 8));
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
      reasons: ['liquidity sweep detection', 'strong wick rejection', 'reclaim close'],
      timeframe,
      volumeConfirmation: last.volume >= avgVol * 1.8,
      marketCondition: 'bullish',
    };
  }
}
