import { getDbClient } from '../database/client';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('ops:retention');

export async function runRetentionCleanup(days = 180): Promise<void> {
  const db = getDbClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { error: archiveError } = await db.rpc('archive_signal_performance_before', { p_cutoff: cutoff });
  if (archiveError) {
    log.warn('Archive RPC failed, continuing with direct cleanup fallback', { err: archiveError.message });
  }

  const { error: deleteError } = await db
    .from('signal_performance')
    .delete()
    .lt('created_at', cutoff);

  if (deleteError) {
    log.error('Retention cleanup failed', { err: deleteError.message, cutoff });
  }
}

export async function refreshStrategyDailyAggregates(): Promise<void> {
  const db = getDbClient();
  const { error } = await db.rpc('refresh_strategy_daily_aggregates');
  if (error) {
    log.error('Failed to refresh strategy daily aggregates', { err: error.message });
  }
}
