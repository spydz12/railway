-- Add signal performance memory for adaptive analytics
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS signal_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_idea_id uuid REFERENCES trade_ideas(id) ON DELETE SET NULL,
  strategy text NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  market_regime text,
  market_type text NOT NULL DEFAULT 'crypto' CHECK (market_type IN ('stocks', 'crypto')),
  exchange text DEFAULT 'unknown',
  entry numeric NOT NULL,
  stop_loss numeric NOT NULL,
  take_profit numeric,
  outcome text NOT NULL,
  win_loss boolean NOT NULL,
  max_favorable_excursion numeric,
  max_adverse_excursion numeric,
  duration_hours numeric,
  ai_decision text,
  ai_confidence numeric,
  fakeout_confidence numeric,
  btc_bias text,
  relative_volume numeric,
  volatility_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_performance_strategy ON signal_performance(strategy);
CREATE INDEX IF NOT EXISTS idx_signal_performance_market_regime ON signal_performance(market_regime);
CREATE INDEX IF NOT EXISTS idx_signal_performance_ai_decision ON signal_performance(ai_decision);
CREATE INDEX IF NOT EXISTS idx_signal_performance_symbol ON signal_performance(symbol);
