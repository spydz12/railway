-- Signal delivery dedup cache for Telegram notifications.
-- TTL is enforced logically via expires_at checks in application code.
CREATE TABLE IF NOT EXISTS signal_delivery_cache (
  fingerprint text PRIMARY KEY,
  symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  strategy_slug text NOT NULL,
  timeframe text NOT NULL,
  rounded_entry numeric(12, 4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signal_delivery_cache_expires_at
  ON signal_delivery_cache(expires_at);

ALTER TABLE signal_delivery_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on signal_delivery_cache"
  ON signal_delivery_cache FOR ALL USING (auth.role() = 'service_role');
