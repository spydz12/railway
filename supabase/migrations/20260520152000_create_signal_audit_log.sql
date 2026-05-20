-- Signal delivery audit log for Telegram notifications.
CREATE TABLE IF NOT EXISTS signal_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NULL,
  fingerprint text NOT NULL,
  ticker text NOT NULL,
  strategy_slug text NOT NULL,
  timeframe text NOT NULL,
  direction text NOT NULL,
  telegram_message_id bigint NULL,
  event_type text NOT NULL,
  skipped_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_signal_audit_log_fingerprint
  ON signal_audit_log(fingerprint);

CREATE INDEX IF NOT EXISTS idx_signal_audit_log_ticker
  ON signal_audit_log(ticker);

CREATE INDEX IF NOT EXISTS idx_signal_audit_log_created_at_desc
  ON signal_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_audit_log_event_type
  ON signal_audit_log(event_type);

ALTER TABLE signal_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on signal_audit_log"
  ON signal_audit_log FOR ALL USING (auth.role() = 'service_role');