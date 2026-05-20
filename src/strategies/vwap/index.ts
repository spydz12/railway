import { Candle, averageVolume, safeAtr } from '../../utils/indicators';
import { StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:vwap');
const debug = config.scanner.debugSignals;

export class VWAPReclaimStrategy {
  slug = 'vwap_reclaim';
  name = 'VWAP Reclaim';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: VWAP Reclaim', { ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 30) {
      if (debug) {
        log.debug('[NO_SIGNAL] VWAP Reclaim - insufficient candles', { ticker, timeframe, candleCount: candles.length });
      }
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];

    // Calculate VWAP
    const vwap = this.calculateVWAP(candles);

    // Check for flush below VWAP followed by reclaim
    const flushBelow = prevCandle.low < vwap * 0.995; // Within 0.5% of VWAP
    const reclaimAbove = lastCandle.close > vwap;

    if (!flushBelow || !reclaimAbove) {
      if (debug) {
        log.debug('[NO_SIGNAL] VWAP Reclaim failed entry conditions', {
          ticker,
          timeframe,
          vwap,
          flushBelow,
          reclaimAbove,
        });
      }
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    // Volume confirmation
    const avgVol = averageVolume(candles.slice(0, -1), 20);
    const volumeSpike = lastCandle.volume > avgVol * 2;

    // Bullish candle confirmation
    const bullishCandle = lastCandle.close > lastCandle.open;
    const bodySize = Math.abs(lastCandle.close - lastCandle.open) / lastCandle.open;

    if (!volumeSpike || !bullishCandle || bodySize < 0.005) {
      if (debug) {
        log.debug('[NO_SIGNAL] VWAP Reclaim failed confirmation', {
          ticker,
          timeframe,
          avgVol,
          lastVolume: lastCandle.volume,
          volumeSpike,
          bullishCandle,
          bodySize,
        });
      }
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    // Calculate entry, stop, and targets
    const entry = lastCandle.close;
    const stopLoss = Math.min(prevCandle.low, vwap * 0.98);
    const atr = safeAtr(candles, 14);
    const risk = entry - stopLoss;

    // Targets: High of day, then extension
    const recentHigh = Math.max(...candles.slice(-20).map(c => c.high));
    const takeProfit1 = Math.max(recentHigh, entry + (risk * 2));
    const takeProfit2 = entry + (risk * 3);

    const riskReward = (takeProfit1 - entry) / risk;

    // Build reasons
    const reasons: string[] = ['vwap_reclaim'];
    if (volumeSpike) reasons.push('high_volume');
    if (bullishCandle) reasons.push('bullish_candle');
    if (bodySize > 0.01) reasons.push('strong_body');

    // Calculate confidence
    let confidence = 60; // Base confidence
    if (volumeSpike) confidence += 15;
    if (bodySize > 0.015) confidence += 10;
    if (riskReward >= 2) confidence += 15;
    const finalConfidence = Math.min(100, confidence);
    const result: StrategyResult = {
      valid: true,
      strategy: this.slug,
      symbol: ticker,
      side: 'LONG',
      confidence: finalConfidence,
      entry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward,
      reasons,
      timeframe,
      volumeConfirmation: volumeSpike,
      marketCondition: 'bullish',
    };

    if (debug) {
      log.debug('[RESULT] VWAP Reclaim', {
        ticker,
        timeframe,
        vwap,
        flushBelow,
        reclaimAbove,
        avgVol,
        volumeSpike,
        bullishCandle,
        bodySize,
        riskReward,
        confidence: finalConfidence,
        reasons,
      });
    }

    return result;
  }

  private calculateVWAP(candles: Candle[]): number {
    let cumulativeVolume = 0;
    let cumulativeVolumePrice = 0;

    for (const candle of candles) {
      const volumePrice = candle.volume * (candle.high + candle.low + candle.close) / 3;
      cumulativeVolume += candle.volume;
      cumulativeVolumePrice += volumePrice;
    }

    return cumulativeVolume > 0 ? cumulativeVolumePrice / cumulativeVolume : 0;
  }
}