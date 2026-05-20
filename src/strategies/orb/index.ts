import { Candle, averageVolume, safeAtr } from '../../utils/indicators';
import { StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:orb');
const debug = config.scanner.debugSignals;

export class ORBStrategy {
  slug = 'orb_breakout';
  name = 'Opening Range Breakout';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: Opening Range Breakout', { ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 20) {
      if (debug) {
        log.debug('[NO_SIGNAL] ORB - insufficient candles', { ticker, timeframe, candleCount: candles.length });
      }
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    // Define opening range (first 15-30 minutes, depending on timeframe)
    const openingRangePeriod = timeframe === '15m' ? 2 : 1; // 30m for 15m timeframe, 15m for others
    const openingCandles = candles.slice(0, openingRangePeriod);

    if (openingCandles.length < openingRangePeriod) {
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    // Calculate opening range
    const openingHigh = Math.max(...openingCandles.map(c => c.high));
    const openingLow = Math.min(...openingCandles.map(c => c.low));
    const openingRange = openingHigh - openingLow;

    // Check for gap
    const preMarketClose = candles[0]?.open || 0;
    const gapUp = openingLow > preMarketClose * 1.005;
    const gapDown = openingHigh < preMarketClose * 0.995;

    if (!gapUp && !gapDown) {
      if (debug) {
        log.debug('[NO_SIGNAL] ORB - no meaningful gap', { ticker, timeframe, preMarketClose, openingHigh, openingLow, gapUp, gapDown });
      }
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    // Check for consolidation after gap
    const postOpeningCandles = candles.slice(openingRangePeriod, openingRangePeriod + 5);
    const consolidation = this.isConsolidating(postOpeningCandles, openingRange);

    if (!consolidation) {
      if (debug) {
        log.debug('[NO_SIGNAL] ORB - no consolidation', { ticker, timeframe, openingRange, recentRange: Math.max(...postOpeningCandles.map(c => c.high)) - Math.min(...postOpeningCandles.map(c => c.low)) });
      }
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    // Find breakout candle
    const breakoutCandle = this.findBreakout(candles.slice(openingRangePeriod), openingHigh, openingLow);

    if (!breakoutCandle) {
      if (debug) {
        log.debug('[NO_SIGNAL] ORB - no breakout candle found', { ticker, timeframe, openingHigh, openingLow });
      }
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    // Volume confirmation
    const avgVol = averageVolume(candles.slice(0, -1), 20);
    const volumeSpike = breakoutCandle.volume > avgVol * 2;

    if (!volumeSpike) {
      if (debug) {
        log.debug('[NO_SIGNAL] ORB - volume too low on breakout', { ticker, timeframe, breakoutVolume: breakoutCandle.volume, avgVol, volumeSpike });
      }
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    // Determine direction and calculate levels
    const isBullishBreakout = breakoutCandle.close > openingHigh;
    const isBearishBreakout = breakoutCandle.close < openingLow;

    if (!isBullishBreakout && !isBearishBreakout) {
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const side = isBullishBreakout ? 'LONG' : 'SHORT';
    const entry = breakoutCandle.close;
    const stopLoss = isBullishBreakout ? openingLow : openingHigh;
    const atr = safeAtr(candles, 14);
    const risk = Math.abs(entry - stopLoss);

    // Measured move target
    const measuredMove = openingRange * 2;
    const takeProfit1 = isBullishBreakout ?
      entry + measuredMove :
      entry - measuredMove;

    const takeProfit2 = isBullishBreakout ?
      entry + (measuredMove * 1.5) :
      entry - (measuredMove * 1.5);

    const riskReward = measuredMove / risk;

    // Build reasons
    const reasons: string[] = ['orb_breakout'];
    if (gapUp) reasons.push('gap_up');
    if (gapDown) reasons.push('gap_down');
    if (volumeSpike) reasons.push('high_volume');
    if (consolidation) reasons.push('consolidation');

    // Calculate confidence
    let confidence = 65; // Base confidence
    if (volumeSpike) confidence += 15;
    if (riskReward >= 2) confidence += 10;
    if (gapUp || gapDown) confidence += 10;
    const finalConfidence = Math.min(100, confidence);

    const result: StrategyResult = {
      valid: true,
      strategy: this.slug,
      symbol: ticker,
      side,
      confidence: finalConfidence,
      entry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward,
      reasons,
      timeframe,
      volumeConfirmation: volumeSpike,
      marketCondition: side === 'LONG' ? 'bullish' : 'bearish',
    };

    if (debug) {
      log.debug('[RESULT] ORB', {
        ticker,
        timeframe,
        openingHigh,
        openingLow,
        openingRange,
        gapUp,
        gapDown,
        consolidation,
        breakoutCandle: {
          open: breakoutCandle.open,
          high: breakoutCandle.high,
          low: breakoutCandle.low,
          close: breakoutCandle.close,
          volume: breakoutCandle.volume,
        },
        volumeSpike,
        avgVol,
        riskReward,
        finalConfidence,
        reasons,
      });
    }

    return result;
  }

  private isConsolidating(candles: Candle[], openingRange: number): boolean {
    if (candles.length < 3) return false;

    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const range = Math.max(...highs) - Math.min(...lows);

    // Consolidation if range is less than 50% of opening range
    return range < openingRange * 0.5;
  }

  private findBreakout(candles: Candle[], openingHigh: number, openingLow: number): Candle | null {
    for (const candle of candles) {
      // Check for decisive breakout with candle close confirmation
      if (candle.close > openingHigh || candle.close < openingLow) {
        // Ensure it's not a fake breakout (wick without close)
        const breakoutDirection = candle.close > openingHigh ? 'up' : 'down';
        const decisiveMove = breakoutDirection === 'up' ?
          candle.close > candle.open && candle.close > (openingHigh + (candle.high - candle.low) * 0.3) :
          candle.close < candle.open && candle.close < (openingLow - (candle.high - candle.low) * 0.3);

        if (decisiveMove) {
          return candle;
        }
      }
    }
    return null;
  }
}