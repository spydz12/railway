import { Candle, averageVolume, findSupportLevels, round2, safeAtr } from '../../utils/indicators';
import { Strategy, StrategyResult, EMPTY_RESULT } from '../base';
import { createComponentLogger } from '../../utils/logger';
import { config } from '../../config';

const log = createComponentLogger('strategy:crypto_liquidity_imbalance');
const debug = config.crypto.debugSignals;

function bodyRatio(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return Math.abs(candle.close - candle.open) / range;
}

export class CryptoLiquidityImbalanceStrategy implements Strategy {
  slug = 'crypto_liquidity_imbalance';
  name = 'Liquidity Imbalance';

  evaluate(candles: Candle[], ticker: string, timeframe: string): StrategyResult {
    if (debug) {
      log.debug('[STRATEGY] Running: Liquidity Imbalance', { ticker, timeframe, candleCount: candles.length });
    }

    if (candles.length < 70) {
      if (debug) log.debug('[NO_SIGNAL] insufficient candles', { ticker, timeframe, candleCount: candles.length });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const c3 = candles[candles.length - 3];

    const bullishFvg = c3.high < last.low;
    const supports = findSupportLevels(candles, 30);
    const support = supports.length > 0 ? supports[supports.length - 1] : prev.low;

    const sweepLow = last.low < support * 0.998 || prev.low < support * 0.998;
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const wickSweep = lowerWick > Math.abs(last.close - last.open) * 1.5;
    const displacement = bodyRatio(last) > 0.6 && last.close > last.open;
    const reclaim = last.close > prev.high * 0.998;

    if (!(bullishFvg || sweepLow || wickSweep)) {
      if (debug) log.debug('[NO_SIGNAL] no imbalance footprint', { ticker, timeframe, bullishFvg, sweepLow, wickSweep });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    if (!displacement || !reclaim) {
      if (debug) log.debug('[NO_SIGNAL] displacement/reclaim missing', { ticker, timeframe, displacement, reclaim });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const avgVol = averageVolume(candles.slice(0, -1), 20);
    const relativeVolume = avgVol > 0 ? last.volume / avgVol : 0;
    if (relativeVolume < 1.4) {
      if (debug) log.debug('[NO_SIGNAL] volume expansion missing', { ticker, timeframe, relativeVolume });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const atrNow = safeAtr(candles, 14);
    if (atrNow <= 0) {
      if (debug) log.debug('[NO_SIGNAL] atr confirmation missing', { ticker, timeframe, atrNow });
      return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };
    }

    const entry = round2(last.close);
    const stopLoss = round2(Math.min(last.low, prev.low));
    const risk = entry - stopLoss;
    if (risk <= 0) return { ...EMPTY_RESULT, strategy: this.slug, symbol: ticker, timeframe };

    const takeProfit1 = round2(entry + Math.max(atrNow * 2.3, risk * 2));
    const takeProfit2 = round2(entry + Math.max(atrNow * 3.2, risk * 3));

    let confidence = 75;
    if (relativeVolume > 2) confidence += 8;
    if (bullishFvg) confidence += 6;
    if (wickSweep) confidence += 6;

    log.info('[SIGNAL] liquidity imbalance detected', {
      ticker,
      timeframe,
      bullishFvg,
      sweepLow,
      wickSweep,
      displacement,
      reclaim,
      relativeVolume,
    });

    const result: StrategyResult = {
      valid: true,
      strategy: this.slug,
      symbol: ticker,
      side: 'LONG',
      confidence: Math.min(95, confidence),
      entry,
      stopLoss,
      takeProfit1,
      takeProfit2,
      riskReward: round2((takeProfit1 - entry) / risk),
      reasons: ['liquidity grab', 'displacement candle', 'reclaim confirmation'],
      timeframe,
      volumeConfirmation: relativeVolume > 1.4,
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
