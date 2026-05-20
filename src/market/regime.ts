import { Candle, atr, ema } from '../utils/indicators';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('market:regime');

export interface MarketRegime {
  trend: 'bullish' | 'bearish' | 'neutral';
  regime: 'trending' | 'ranging' | 'volatile' | 'breakout_expansion' | 'panic_selloff' | 'euphoric_momentum' | 'high_volatility_compression';
  strength: number; // 0-100
  volatility: number;
  volume: number;
  atr: number;
  volumeExpansion: number;
  adx: number;
  rsi: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
}

export class MarketRegimeDetector {
  detectRegime(candles: Candle[], spyCandles?: Candle[]): MarketRegime {
    if (candles.length < 50) {
      return {
        trend: 'neutral',
        regime: 'ranging',
        strength: 0,
        volatility: 0,
        volume: 0,
        atr: 0,
        volumeExpansion: 1,
        adx: 0,
        rsi: 0,
        macdSignal: 'neutral',
      };
    }

    const adx = this.calculateADX(candles);
    const rsi = this.calculateRSI(candles);
    const volatility = this.calculateVolatility(candles);
    const volume = this.calculateAverageVolume(candles);
    const atrValue = atr(candles, 14);
    const macdSignal = this.calculateMACDSignal(candles);
    const volumeExpansion = this.calculateVolumeExpansion(candles);
    const ema21 = ema(candles.map((c) => c.close), 21);
    const ema50 = ema(candles.map((c) => c.close), 50);

    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (adx > 25 && ema21.length > 1 && ema50.length > 1) {
      const ema21Slope = ema21[ema21.length - 1] - ema21[ema21.length - 2];
      const ema50Slope = ema50[ema50.length - 1] - ema50[ema50.length - 2];

      if (ema21Slope > 0 && ema50Slope > 0) {
        trend = 'bullish';
      } else if (ema21Slope < 0 && ema50Slope < 0) {
        trend = 'bearish';
      }
    }

    let regime: MarketRegime['regime'] = 'ranging';

    if (adx > 30 && volatility > 3.0 && trend === 'bullish' && volumeExpansion > 1.1) {
      regime = 'breakout_expansion';
    } else if (adx > 30 && volatility > 3.0 && trend === 'bearish' && rsi < 35) {
      regime = 'panic_selloff';
    } else if (volatility > 3.5 && rsi > 70 && trend === 'bullish') {
      regime = 'euphoric_momentum';
    } else if (volatility > 4.0 && adx < 20) {
      regime = 'high_volatility_compression';
    } else if (adx > 25 && volatility > 2.0) {
      regime = 'trending';
    } else if (volatility > 3.0) {
      regime = 'volatile';
    }

    const strength = Math.min(100, Math.max(0, (adx / 50) * 100));

    log.debug(`Market regime detected: ${regime}, trend: ${trend}, strength: ${strength.toFixed(1)}, atr: ${atrValue.toFixed(2)}, volumeExpansion: ${volumeExpansion.toFixed(2)}`);

    return {
      trend,
      regime,
      strength,
      volatility,
      volume,
      atr: atrValue,
      volumeExpansion,
      adx,
      rsi,
      macdSignal,
    };
  }

  private calculateADX(candles: Candle[]): number {
    if (candles.length < 14) return 0;

    const trValues: number[] = [];
    const plusDMValues: number[] = [];
    const minusDMValues: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const current = candles[i];
      const previous = candles[i - 1];

      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      );

      const plusDM = (current.high - previous.high > previous.low - current.low) ?
        Math.max(current.high - previous.high, 0) : 0;

      const minusDM = (previous.low - current.low > current.high - previous.high) ?
        Math.max(previous.low - current.low, 0) : 0;

      trValues.push(tr);
      plusDMValues.push(plusDM);
      minusDMValues.push(minusDM);
    }

    // Smooth the values (simplified ADX calculation)
    const avgTR = trValues.reduce((sum, tr) => sum + tr, 0) / trValues.length;
    const avgPlusDM = plusDMValues.reduce((sum, dm) => sum + dm, 0) / plusDMValues.length;
    const avgMinusDM = minusDMValues.reduce((sum, dm) => sum + dm, 0) / minusDMValues.length;

    const plusDI = (avgPlusDM / avgTR) * 100;
    const minusDI = (avgMinusDM / avgTR) * 100;

    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
    return dx;
  }

  private calculateRSI(candles: Candle[]): number {
    if (candles.length < 14) return 50;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / losses.length;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateVolatility(candles: Candle[]): number {
    if (candles.length < 10) return 0;

    const returns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const return_pct = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
      returns.push(return_pct);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * 100; // Convert to percentage
  }

  private calculateAverageVolume(candles: Candle[]): number {
    const recentCandles = candles.slice(-20);
    return recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
  }

  private calculateVolumeExpansion(candles: Candle[]): number {
    const recentLength = 5;
    if (candles.length < recentLength + 5) return 1;

    const recent = candles.slice(-recentLength);
    const prior = candles.slice(-recentLength - 5, -recentLength);
    const recentAvg = recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;
    const priorAvg = prior.reduce((sum, c) => sum + c.volume, 0) / prior.length;
    return priorAvg > 0 ? recentAvg / priorAvg : 1;
  }

  private calculateMACDSignal(candles: Candle[]): 'bullish' | 'bearish' | 'neutral' {
    if (candles.length < 26) return 'neutral';

    const ema12 = ema(candles.map((c) => c.close), 12);
    const ema26 = ema(candles.map((c) => c.close), 26);

    if (ema12.length === 0 || ema26.length === 0) return 'neutral';
    const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];

    if (macdLine > 0) return 'bullish';
    if (macdLine < 0) return 'bearish';
    return 'neutral';
  }
}
