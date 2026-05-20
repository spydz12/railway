ALTER TABLE trade_ideas
  ADD COLUMN IF NOT EXISTS market_condition text;
