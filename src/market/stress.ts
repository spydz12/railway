export type MarketStressLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export function assessMarketStressFromRegime(
  regime: string,
  recentLossRate: number,
  volatility: number
): MarketStressLevel {
  let score = 0;

  if (['breakout_expansion', 'panic_selloff', 'euphoric_momentum', 'high_volatility_compression'].includes(regime)) {
    score += 2;
  }
  if (regime === 'volatile') {
    score += 1;
  }
  if (recentLossRate >= 0.5) {
    score += 2;
  } else if (recentLossRate >= 0.3) {
    score += 1;
  }
  if (volatility >= 3) {
    score += 2;
  } else if (volatility >= 2) {
    score += 1;
  }

  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'MEDIUM';
  return 'LOW';
}

export function estimateVolatilityLevel(regime: string): number {
  switch (regime) {
    case 'breakout_expansion':
    case 'euphoric_momentum':
      return 4.5;
    case 'panic_selloff':
    case 'high_volatility_compression':
      return 4.0;
    case 'volatile':
      return 3.0;
    case 'trending':
      return 2.0;
    default:
      return 1.5;
  }
}
