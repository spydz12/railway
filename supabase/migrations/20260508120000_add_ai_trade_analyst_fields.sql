-- Add AI Trade Analyst fields to trade_ideas table
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ai_decision text CHECK (ai_decision IN ('APPROVE', 'REJECT', 'WATCH'));
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ai_confidence integer CHECK (ai_confidence BETWEEN 0 AND 100);
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ai_risk_level text CHECK (ai_risk_level IN ('LOW', 'MEDIUM', 'HIGH'));
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ai_approval_reasons text[];
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ai_risk_warnings text[];
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ai_suggested_action text;
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ai_model_used text DEFAULT 'gpt-4o-mini';
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ai_raw_response jsonb;
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS market_type text NOT NULL DEFAULT 'stocks' CHECK (market_type IN ('stocks', 'crypto'));
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS exchange text DEFAULT 'unknown';
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS crypto_metadata jsonb;

-- Create rejected_signals table for tracking AI rejections
CREATE TABLE IF NOT EXISTS rejected_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  strategy text NOT NULL,
  confidence integer NOT NULL,
  ai_decision text CHECK (ai_decision IN ('APPROVE', 'REJECT', 'WATCH')),
  ai_confidence integer,
  rejection_reasons text[],
  ai_summary text,
  ai_risk_warnings text[],
  created_at timestamptz DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_rejected_signals_symbol ON rejected_signals(symbol);
CREATE INDEX IF NOT EXISTS idx_rejected_signals_created_at ON rejected_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_ai_decision ON trade_ideas(ai_decision);

-- Enable RLS
ALTER TABLE rejected_signals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rejected_signals
CREATE POLICY "Service role can do anything on rejected_signals" ON rejected_signals
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Anon can read rejected_signals" ON rejected_signals
  FOR SELECT USING (auth.role() = 'anon');