import { Candle, ema, volatility } from '../../utils/indicators';
import { createComponentLogger } from '../../utils/logger';

const log = createComponentLogger('strategy:crypto_btc_leader_filter');

export interface BtcTrendBias {
  trend: 'bullish' | 'bearish' | 'ranging' | 'neutral';
  adjustment: number;
  reason: string;
  volatility: 'high' | 'normal' | 'low';
}

export function calculateBtcTrendBias(candles: Candle[]): BtcTrendBias {
  const closes = candles.map((c) => c.close);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);

  if (ema21.length < 2 || ema50.length < 2) {
    return {
      trend: 'neutral',
      adjustment: 0,
      reason: 'Insufficient BTC market bias data',
      volatility: 'normal',
    };
  }

  const currentEma21 = ema21[ema21.length - 1];
  const currentEma50 = ema50[ema50.length - 1];
  const volatilityScore = volatility(candles, 20);
  const volatilityLabel = volatilityScore > 2.5 ? 'high' : volatilityScore < 1.2 ? 'low' : 'normal';

  if (currentEma21 > currentEma50 * 1.01) {
    return {
      trend: 'bullish',
      adjustment: 8,
      reason: 'BTC trend is bullish; boosting altcoin LONG confidence',
      volatility: volatilityLabel,
    };
  }

  if (currentEma21 < currentEma50 * 0.99) {
    return {
      trend: 'bearish',
      adjustment: -10,
      reason: 'BTC trend is bearish; reducing altcoin LONG confidence',
      volatility: volatilityLabel,
    };
  }

  return {
    trend: 'ranging',
    adjustment: 0,
    reason: 'BTC is ranging; favoring mean reversion and caution on breakouts',
    volatility: volatilityLabel,
  };
}
