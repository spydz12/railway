/*
  # AI Stock Trade Ideas Bot - Complete Database Schema

  ## Summary
  Full schema for the AI Stock Trade Ideas Telegram Bot system.

  ## Tables Created

  ### 1. stocks
  Master list of tracked US stocks with metadata.
  - id, ticker, company_name, sector, active, min_volume, created_at

  ### 2. market_provider_configs
  Configuration for market data providers with priority ordering.
  - id, provider_name, priority, enabled, rate_limit_per_minute, created_at

  ### 3. strategies
  Registry of implemented trading strategies.
  - id, name, slug, description, enabled, min_confidence, created_at

  ### 4. trade_ideas
  Core table storing every generated trade idea with full details.
  - id, ticker, company_name, direction, strategy_slug, timeframe
  - entry_price, entry_zone_low, entry_zone_high
  - stop_loss, take_profit_1, take_profit_2
  - trailing_rule, invalidation_rule
  - confidence_score, risk_reward_ratio
  - reason, status, provider_used
  - created_at, updated_at, closed_at, exit_reason

  ### 5. trade_idea_updates
  Audit trail of all status changes for each trade idea.
  - id, trade_idea_id, update_type, message, price_at_update, created_at

  ### 6. logs
  System-level structured logs.
  - id, level, component, message, metadata, created_at

  ### 7. settings
  Key-value settings store for runtime configuration.
  - id, key, value, description, updated_at

  ## Security
  - RLS enabled on all tables
  - Service role has full access for backend operations
  - Anon key has read-only access to non-sensitive tables
*/

-- ============================================================
-- STOCKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS stocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL UNIQUE,
  company_name text DEFAULT '',
  sector text DEFAULT '',
  active boolean DEFAULT true,
  min_volume bigint DEFAULT 500000,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on stocks"
  ON stocks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read stocks"
  ON stocks FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- MARKET PROVIDER CONFIGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS market_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,
  priority integer DEFAULT 1,
  enabled boolean DEFAULT true,
  rate_limit_per_minute integer DEFAULT 60,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE market_provider_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read provider configs"
  ON market_provider_configs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can read provider configs"
  ON market_provider_configs FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- STRATEGIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text DEFAULT '',
  enabled boolean DEFAULT true,
  min_confidence integer DEFAULT 60,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read strategies"
  ON strategies FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can read strategies"
  ON strategies FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- TRADE IDEAS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  company_name text DEFAULT '',
  direction text NOT NULL CHECK (direction IN ('BUY', 'SELL', 'SHORT', 'LONG')),
  strategy_slug text NOT NULL REFERENCES strategies(slug),
  timeframe text NOT NULL DEFAULT '15m',
  entry_price numeric(12, 4),
  entry_zone_low numeric(12, 4),
  entry_zone_high numeric(12, 4),
  stop_loss numeric(12, 4) NOT NULL,
  take_profit_1 numeric(12, 4) NOT NULL,
  take_profit_2 numeric(12, 4),
  take_profit_3 numeric(12, 4),
  trailing_rule text DEFAULT '',
  invalidation_rule text DEFAULT '',
  confidence_score integer DEFAULT 50 CHECK (confidence_score BETWEEN 0 AND 100),
  risk_reward_ratio numeric(6, 2) DEFAULT 0,
  reason text DEFAULT '',
  reasons text[] DEFAULT '{}',
  volume_confirmation boolean DEFAULT false,
  market_type text NOT NULL DEFAULT 'stocks' CHECK (market_type IN ('stocks', 'crypto')),
  exchange text DEFAULT 'unknown',
  crypto_metadata jsonb,
  market_condition text DEFAULT 'neutral',
  total_score integer DEFAULT 0,
  signal_quality text DEFAULT 'MEDIUM' CHECK (signal_quality IN ('ELITE', 'HIGH_QUALITY', 'MEDIUM', 'REJECT')),
  rejection_reasons text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'tp1_reached', 'tp2_reached', 'stopped', 'invalidated', 'expired', 'closed')),
  provider_used text DEFAULT '',
  telegram_message_id bigint,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  exit_reason text DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_trade_ideas_ticker ON trade_ideas(ticker);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_status ON trade_ideas(status);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_created_at ON trade_ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_strategy_slug ON trade_ideas(strategy_slug);

ALTER TABLE trade_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read trade ideas"
  ON trade_ideas FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can read trade ideas"
  ON trade_ideas FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- TRADE IDEA UPDATES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS trade_idea_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_idea_id uuid NOT NULL REFERENCES trade_ideas(id) ON DELETE CASCADE,
  update_type text NOT NULL CHECK (update_type IN (
    'entry_triggered', 'entry_missed', 'tp1_reached', 'tp2_reached',
    'stop_hit', 'invalidated', 'breakout_failed', 'time_exit',
    'trailing_stop_activated', 'closed', 'monitoring_started', 'note'
  )),
  message text DEFAULT '',
  price_at_update numeric(12, 4),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_idea_updates_idea_id ON trade_idea_updates(trade_idea_id);
CREATE INDEX IF NOT EXISTS idx_trade_idea_updates_created_at ON trade_idea_updates(created_at DESC);

ALTER TABLE trade_idea_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read trade updates"
  ON trade_idea_updates FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can read trade updates"
  ON trade_idea_updates FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  component text NOT NULL DEFAULT 'system',
  message text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_component ON logs(component);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read logs"
  ON logs FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read settings"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read settings"
  ON settings FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Market providers
INSERT INTO market_provider_configs (provider_name, priority, enabled, rate_limit_per_minute, notes)
VALUES
  ('polygon', 1, true, 5, 'Polygon.io - Free tier: 5 req/min, Paid: unlimited'),
  ('alpaca', 2, true, 200, 'Alpaca Markets - Free tier available'),
  ('finnhub', 3, true, 60, 'Finnhub - 60 calls/min on free tier'),
  ('twelvedata', 4, true, 8, 'Twelve Data - 8 req/min on free tier')
ON CONFLICT (provider_name) DO NOTHING;

-- Strategies
INSERT INTO strategies (name, slug, description, enabled, min_confidence)
VALUES
  ('Trend Pullback', 'trend_pullback', 'EMA20 > EMA50, price pulls back near EMA20, RSI > 50, confirmation candle', true, 65),
  ('Breakout + Volume', 'breakout_volume', 'Break above resistance with volume spike above average, candle closes above level', true, 65),
  ('Support Bounce', 'support_bounce', 'Strong support zone with rejection candle (hammer/engulfing) and volume confirmation', true, 60)
ON CONFLICT (slug) DO NOTHING;

-- Default settings
INSERT INTO settings (key, value, description)
VALUES
  ('max_risk_per_trade_pct', '1.0', 'Maximum risk per trade as percentage'),
  ('min_risk_reward', '2.0', 'Minimum risk/reward ratio required'),
  ('max_signals_per_day', '10', 'Maximum number of trade signals to send per day'),
  ('scan_interval_minutes', '5', 'How often to scan for new setups (minutes)'),
  ('market_session_filter', 'true', 'Only scan during US market hours'),
  ('min_volume_filter', '500000', 'Minimum average daily volume for a stock to be scanned'),
  ('allow_short_selling', 'false', 'Allow SHORT/SELL trade directions'),
  ('tracking_interval_minutes', '2', 'How often to check active trade idea status'),
  ('max_trade_age_hours', '72', 'Auto-close trade ideas older than this many hours')
ON CONFLICT (key) DO NOTHING;

-- Default watchlist (popular US stocks)
INSERT INTO stocks (ticker, company_name, sector, active, min_volume)
VALUES
  ('AAPL', 'Apple Inc.', 'Technology', true, 50000000),
  ('MSFT', 'Microsoft Corporation', 'Technology', true, 20000000),
  ('GOOGL', 'Alphabet Inc.', 'Technology', true, 15000000),
  ('AMZN', 'Amazon.com Inc.', 'Consumer Discretionary', true, 30000000),
  ('NVDA', 'NVIDIA Corporation', 'Technology', true, 40000000),
  ('META', 'Meta Platforms Inc.', 'Technology', true, 20000000),
  ('TSLA', 'Tesla Inc.', 'Consumer Discretionary', true, 80000000),
  ('JPM', 'JPMorgan Chase & Co.', 'Financials', true, 10000000),
  ('V', 'Visa Inc.', 'Financials', true, 5000000),
  ('UNH', 'UnitedHealth Group', 'Healthcare', true, 3000000),
  ('JNJ', 'Johnson & Johnson', 'Healthcare', true, 5000000),
  ('XOM', 'Exxon Mobil Corporation', 'Energy', true, 15000000),
  ('WMT', 'Walmart Inc.', 'Consumer Staples', true, 8000000),
  ('PG', 'Procter & Gamble Co.', 'Consumer Staples', true, 5000000),
  ('MA', 'Mastercard Inc.', 'Financials', true, 3000000),
  ('AMD', 'Advanced Micro Devices', 'Technology', true, 50000000),
  ('INTC', 'Intel Corporation', 'Technology', true, 30000000),
  ('CRM', 'Salesforce Inc.', 'Technology', true, 5000000),
  ('NFLX', 'Netflix Inc.', 'Communication Services', true, 5000000),
  ('DIS', 'The Walt Disney Company', 'Communication Services', true, 8000000),
  ('SPY', 'SPDR S&P 500 ETF Trust', 'ETF', true, 60000000),
  ('QQQ', 'Invesco QQQ Trust', 'ETF', true, 40000000),
  ('BAC', 'Bank of America Corp', 'Financials', true, 30000000),
  ('PYPL', 'PayPal Holdings Inc.', 'Financials', true, 10000000),
  ('ADBE', 'Adobe Inc.', 'Technology', true, 3000000)
ON CONFLICT (ticker) DO NOTHING;

-- Auto-update updated_at on trade_ideas
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_trade_ideas_updated_at ON trade_ideas;
CREATE TRIGGER update_trade_ideas_updated_at
  BEFORE UPDATE ON trade_ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
