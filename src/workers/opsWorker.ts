import cron from 'node-cron';
import { createComponentLogger } from '../utils/logger';
import { runRetentionCleanup, refreshStrategyDailyAggregates } from '../ops/retention';
import { runHealthMonitor } from '../ops/healthMonitor';
import { config } from '../config';

const log = createComponentLogger('worker:ops');

export function startOpsWorker(): void {
  cron.schedule('*/5 * * * *', async () => {
    await runHealthMonitor();
  });

  cron.schedule('0 */6 * * *', async () => {
    await refreshStrategyDailyAggregates();
  });

  cron.schedule('30 2 * * *', async () => {
    await runRetentionCleanup(config.ops.retentionDays);
  });

  log.info('Ops worker started (health monitor + aggregation + retention)');
}
