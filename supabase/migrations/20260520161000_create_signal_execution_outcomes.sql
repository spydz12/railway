-- Signal execution lifecycle outcomes for trade ideas.
CREATE TABLE IF NOT EXISTS signal_execution_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL,
  ticker text NOT NULL,
  strategy_slug text NOT NULL,
  timeframe text NOT NULL,
  direction text NOT NULL,
  entry_price numeric(12, 4),
  exit_price numeric(12, 4) NULL,
  result text NOT NULL CHECK (result IN ('WIN', 'LOSS', 'BREAKEVEN', 'EXPIRED', 'OPEN')),
  profit_percent numeric(10, 4) NULL,
  duration_minutes integer NULL,
  close_reason text NULL,
  tp_hit integer NULL CHECK (tp_hit IN (1, 2, 3)),
  closed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_execution_outcomes_signal_id
  ON signal_execution_outcomes(signal_id);

CREATE INDEX IF NOT EXISTS idx_signal_execution_outcomes_ticker
  ON signal_execution_outcomes(ticker);

CREATE INDEX IF NOT EXISTS idx_signal_execution_outcomes_result
  ON signal_execution_outcomes(result);

CREATE INDEX IF NOT EXISTS idx_signal_execution_outcomes_created_at_desc
  ON signal_execution_outcomes(created_at DESC);

ALTER TABLE signal_execution_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on signal_execution_outcomes"
  ON signal_execution_outcomes FOR ALL USING (auth.role() = 'service_role');