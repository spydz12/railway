import { getDbClient } from '../database/client';
import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('ops:startup-recovery');

export async function runStartupRecovery(): Promise<void> {
  const db = getDbClient();

  const staleCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { error } = await db
    .from('paper_positions')
    .update({
      status: 'closed',
      close_reason: 'startup_recovery_timeout',
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'open')
    .lt('opened_at', staleCutoff);

  if (error) {
    log.warn('Startup recovery skipped (paper tables may not be migrated yet)', { err: error.message });
  }
}
