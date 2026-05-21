-- Extend allowed trade_ideas statuses for crypto scanner lifecycle states.
-- Keeps existing values for backward compatibility while preserving strict validation.
ALTER TABLE trade_ideas
  DROP CONSTRAINT IF EXISTS trade_ideas_status_check;

ALTER TABLE trade_ideas
  ADD CONSTRAINT trade_ideas_status_check
  CHECK (
    status IN (
      'pending',
      'active',
      'candidate',
      'watch',
      'tp1_reached',
      'tp2_reached',
      'stopped',
      'invalidated',
      'expired',
      'closed',
      'rejected'
    )
  );
