-- Context-level reinforcement learning state derived from real execution outcomes.
CREATE TABLE IF NOT EXISTS context_learning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_slug text NOT NULL,
  ticker text NOT NULL,
  timeframe text NOT NULL,
  session text NOT NULL,
  direction text NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_context_learning_key
  ON context_learning(strategy_slug, ticker, timeframe, session, direction);

CREATE INDEX IF NOT EXISTS idx_context_learning_strategy_slug
  ON context_learning(strategy_slug);

CREATE INDEX IF NOT EXISTS idx_context_learning_strategy_ticker
  ON context_learning(strategy_slug, ticker);

CREATE INDEX IF NOT EXISTS idx_context_learning_strategy_ticker_timeframe
  ON context_learning(strategy_slug, ticker, timeframe);

CREATE INDEX IF NOT EXISTS idx_context_learning_full_context
  ON context_learning(strategy_slug, ticker, timeframe, session, direction);

ALTER TABLE context_learning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on context_learning"
  ON context_learning FOR ALL USING (auth.role() = 'service_role');
