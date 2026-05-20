-- Paper trading, validation aggregates, and hardening indexes

CREATE TABLE IF NOT EXISTS paper_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'USD',
  starting_balance numeric(18, 2) NOT NULL DEFAULT 100000,
  current_balance numeric(18, 2) NOT NULL DEFAULT 100000,
  unrealized_pnl numeric(18, 2) NOT NULL DEFAULT 0,
  realized_pnl numeric(18, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
  trade_idea_id uuid REFERENCES trade_ideas(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  market_type text NOT NULL DEFAULT 'stocks' CHECK (market_type IN ('stocks', 'crypto')),
  strategy_slug text NOT NULL,
  side text NOT NULL DEFAULT 'LONG' CHECK (side IN ('LONG', 'SHORT')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  quantity numeric(18, 8) NOT NULL,
  entry_price numeric(18, 8) NOT NULL,
  effective_entry_price numeric(18, 8) NOT NULL,
  stop_loss numeric(18, 8) NOT NULL,
  trailing_stop numeric(18, 8),
  take_profit_1 numeric(18, 8),
  take_profit_2 numeric(18, 8),
  partial_tp_taken boolean NOT NULL DEFAULT false,
  partial_tp_ratio numeric(8, 4) NOT NULL DEFAULT 0.5,
  slippage_bps numeric(10, 2) NOT NULL DEFAULT 5,
  fee_bps numeric(10, 2) NOT NULL DEFAULT 10,
  realized_pnl numeric(18, 8) NOT NULL DEFAULT 0,
  unrealized_pnl numeric(18, 8) NOT NULL DEFAULT 0,
  max_favorable_excursion numeric(18, 8),
  max_adverse_excursion numeric(18, 8),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paper_fills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES paper_positions(id) ON DELETE CASCADE,
  fill_type text NOT NULL CHECK (fill_type IN ('entry', 'partial_tp', 'final_exit', 'stop_loss', 'trailing_stop')),
  quantity numeric(18, 8) NOT NULL,
  price numeric(18, 8) NOT NULL,
  fee_paid numeric(18, 8) NOT NULL DEFAULT 0,
  realized_pnl numeric(18, 8) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paper_equity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
  equity numeric(18, 8) NOT NULL,
  balance numeric(18, 8) NOT NULL,
  unrealized_pnl numeric(18, 8) NOT NULL,
  realized_pnl numeric(18, 8) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_daily_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_day date NOT NULL,
  strategy text NOT NULL,
  total_trades integer NOT NULL,
  wins integer NOT NULL,
  losses integer NOT NULL,
  gross_pnl numeric(18, 8) NOT NULL,
  avg_hold_hours numeric(12, 4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_day, strategy)
);

CREATE TABLE IF NOT EXISTS signal_performance_archive (
  LIKE signal_performance INCLUDING ALL
);

CREATE INDEX IF NOT EXISTS idx_paper_positions_account_status ON paper_positions(account_id, status);
CREATE INDEX IF NOT EXISTS idx_paper_positions_symbol_status ON paper_positions(symbol, status);
CREATE INDEX IF NOT EXISTS idx_paper_positions_opened_at ON paper_positions(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_positions_strategy_slug ON paper_positions(strategy_slug);
CREATE INDEX IF NOT EXISTS idx_paper_fills_position_id ON paper_fills(position_id);
CREATE INDEX IF NOT EXISTS idx_paper_fills_created_at ON paper_fills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paper_equity_snapshots_account_recorded ON paper_equity_snapshots(account_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_perf_created_at ON signal_performance(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_perf_strategy_created ON signal_performance(strategy, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_status_created ON trade_ideas(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_ai_decision_created ON trade_ideas(ai_decision, created_at DESC);

ALTER TABLE paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_equity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_daily_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_performance_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on paper_accounts"
  ON paper_accounts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on paper_positions"
  ON paper_positions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on paper_fills"
  ON paper_fills FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on paper_equity_snapshots"
  ON paper_equity_snapshots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on strategy_daily_aggregates"
  ON strategy_daily_aggregates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on signal_performance_archive"
  ON signal_performance_archive FOR ALL USING (auth.role() = 'service_role');

INSERT INTO paper_accounts (account_name, currency, starting_balance, current_balance)
VALUES ('default', 'USD', 100000, 100000)
ON CONFLICT (account_name) DO NOTHING;

CREATE OR REPLACE FUNCTION archive_signal_performance_before(p_cutoff timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO signal_performance_archive
  SELECT *
  FROM signal_performance
  WHERE created_at < p_cutoff;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_strategy_daily_aggregates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM strategy_daily_aggregates
  WHERE trade_day >= current_date - interval '400 days';

  INSERT INTO strategy_daily_aggregates (trade_day, strategy, total_trades, wins, losses, gross_pnl, avg_hold_hours)
  SELECT
    date_trunc('day', created_at)::date AS trade_day,
    strategy,
    COUNT(*) AS total_trades,
    SUM(CASE WHEN win_loss THEN 1 ELSE 0 END)::int AS wins,
    SUM(CASE WHEN win_loss THEN 0 ELSE 1 END)::int AS losses,
    SUM(
      CASE
        WHEN abs(entry - stop_loss) <= 0 THEN 0
        WHEN win_loss THEN abs(coalesce(take_profit, entry) - entry) / abs(entry - stop_loss)
        ELSE -1
      END
    )::numeric(18, 8) AS gross_pnl,
    AVG(coalesce(duration_hours, 0))::numeric(12, 4) AS avg_hold_hours
  FROM signal_performance
  WHERE created_at >= current_date - interval '400 days'
  GROUP BY date_trunc('day', created_at)::date, strategy
  ON CONFLICT (trade_day, strategy) DO UPDATE
    SET total_trades = excluded.total_trades,
        wins = excluded.wins,
        losses = excluded.losses,
        gross_pnl = excluded.gross_pnl,
        avg_hold_hours = excluded.avg_hold_hours;
END;
$$;
