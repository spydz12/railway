-- Ensure array columns exist in trade_ideas (safeguard for deployments predating these columns)
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS reasons text[] NOT NULL DEFAULT '{}';
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS rejection_reasons text[] NOT NULL DEFAULT '{}';
