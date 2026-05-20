ALTER TABLE trade_ideas
  DROP CONSTRAINT IF EXISTS trade_ideas_signal_quality_check;

ALTER TABLE trade_ideas
  ADD CONSTRAINT trade_ideas_signal_quality_check
  CHECK (signal_quality IN ('ELITE', 'HIGH_QUALITY', 'HIGH', 'MEDIUM', 'WATCH', 'REJECT'));
