-- Extend allowed trade_ideas statuses for scanner watch-mode signals.
-- Keeps all existing statuses for backward compatibility and validation.
ALTER TABLE trade_ideas
  DROP CONSTRAINT IF EXISTS trade_ideas_status_check;

ALTER TABLE trade_ideas
  ADD CONSTRAINT trade_ideas_status_check
  CHECK (
    status IN (
      'pending',
      'active',
      'watch',
      'tp1_reached',
      'tp2_reached',
      'stopped',
      'invalidated',
      'expired',
      'closed'
    )
  );