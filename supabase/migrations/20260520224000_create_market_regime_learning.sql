-- Market-regime level reinforcement memory per strategy context.
CREATE TABLE IF NOT EXISTS market_regime_learning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_slug text NOT NULL,
  ticker text,
  timeframe text NOT NULL,
  direction text NOT NULL,
  market_regime text NOT NULL,
  session text NOT NULL,
  trades integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  win_rate numeric(6, 2) NOT NULL DEFAULT 0,
  avg_profit numeric(10, 4) NOT NULL DEFAULT 0,
  confidence_modifier numeric(10, 2) NOT NULL DEFAULT 0,
  position_size_modifier numeric(10, 3) NOT NULL DEFAULT 1,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_market_regime_learning_key
  ON market_regime_learning(strategy_slug, ticker, timeframe, direction, market_regime, session);

CREATE INDEX IF NOT EXISTS idx_market_regime_learning_strategy
  ON market_regime_learning(strategy_slug);

CREATE INDEX IF NOT EXISTS idx_market_regime_learning_strategy_ticker
  ON market_regime_learning(strategy_slug, ticker);

CREATE INDEX IF NOT EXISTS idx_market_regime_learning_lookup
  ON market_regime_learning(strategy_slug, ticker, timeframe, direction, market_regime, session);

ALTER TABLE market_regime_learning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on market_regime_learning"
  ON market_regime_learning FOR ALL USING (auth.role() = 'service_role');
