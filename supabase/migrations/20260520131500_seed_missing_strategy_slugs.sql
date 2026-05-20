-- Seed missing strategy slugs required by trade_ideas.strategy_slug FK.
-- Inserts are idempotent and preserve existing rows.
INSERT INTO strategies (name, slug, description, enabled, min_confidence)
VALUES
  ('Trend Pullback', 'trend_pullback', 'EMA20 > EMA50, price pulls back near EMA20, RSI > 50, confirmation candle', true, 65),
  ('Breakout + Volume', 'breakout_volume', 'Break above resistance with volume spike above average, candle closes above level', true, 65),
  ('Support Bounce', 'support_bounce', 'Strong support zone with rejection candle (hammer/engulfing) and volume confirmation', true, 60),
  ('VWAP Reclaim', 'vwap_reclaim', 'Flush below VWAP followed by reclaim above VWAP with confirmation volume', true, 60),
  ('Opening Range Breakout', 'orb_breakout', 'Breakout of opening range after gap and consolidation', true, 65),
  ('EMA Cloud Trend', 'ema_cloud_trend', 'Trend continuation using EMA cloud pullback and rejection', true, 60),
  ('Mean Reversion', 'mean_reversion', 'Mean reversion setup using Bollinger/RSI extremes and reversion targets', true, 55),
  ('Crypto Momentum Breakout', 'crypto_momentum_breakout', 'Crypto breakout above resistance with volume and momentum confirmation', true, 60),
  ('VWAP Crypto Reclaim', 'crypto_vwap_reclaim', 'Crypto VWAP reclaim following liquidity flush and reclaim', true, 60),
  ('EMA Trend Cloud', 'crypto_ema_trend_cloud', 'Crypto trend continuation using EMA21/EMA50 cloud alignment', true, 60),
  ('Liquidity Sweep Reversal', 'crypto_liquidity_sweep_reversal', 'Reversal after liquidity sweep and reclaim with volume support', true, 60),
  ('RSI + Bollinger Mean Reversion', 'crypto_rsi_bollinger_reversion', 'Mean reversion using oversold RSI and lower Bollinger band touch', true, 58),
  ('Binance Market Regime Grid', 'crypto_market_regime_grid', 'Range/grid strategy for ranging market regimes', true, 60),
  ('BTC Market Leader Bias', 'crypto_btc_market_leader', 'Applies BTC context as leader bias for crypto setup validation', true, 60),
  ('Adaptive Momentum', 'crypto_adaptive_momentum', 'Adaptive momentum continuation with volatility and volume expansion filters', true, 62),
  ('Scalp Micro Breakout', 'crypto_scalp_microbreakout', 'Short timeframe micro-breakout scalp with strict momentum checks', true, 58),
  ('Liquidity Imbalance', 'crypto_liquidity_imbalance', 'Identifies liquidity imbalance and displacement/reclaim continuation', true, 62),
  ('Dynamic DCA Reversal', 'crypto_dynamic_dca_reversal', 'Oversold reversal strategy with dynamic DCA-style confirmation', true, 60)
ON CONFLICT (slug) DO NOTHING;
