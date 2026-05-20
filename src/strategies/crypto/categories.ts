export const TREND_STRATEGIES = [
  'crypto_momentum_breakout',
  'crypto_ema_trend_cloud',
  'crypto_vwap_reclaim',
  'crypto_btc_market_leader',
  'crypto_adaptive_momentum',
  'crypto_scalp_microbreakout',
] as const;

export const MEAN_REVERSION_STRATEGIES = [
  'crypto_rsi_bollinger_reversion',
  'crypto_liquidity_sweep_reversal',
  'crypto_market_regime_grid',
  'crypto_liquidity_imbalance',
  'crypto_dynamic_dca_reversal',
] as const;

export type CryptoStrategyCategory = 'TREND' | 'MEAN_REVERSION' | 'OTHER';

export function getCryptoStrategyCategory(strategy: string): CryptoStrategyCategory {
  if (TREND_STRATEGIES.includes(strategy as (typeof TREND_STRATEGIES)[number])) {
    return 'TREND';
  }

  if (MEAN_REVERSION_STRATEGIES.includes(strategy as (typeof MEAN_REVERSION_STRATEGIES)[number])) {
    return 'MEAN_REVERSION';
  }

  return 'OTHER';
}
