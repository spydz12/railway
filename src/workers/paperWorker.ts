import cron from 'node-cron';
import { getActiveTradeIdeas } from '../database/queries';
import { ensurePaperPositionFromIdea, updatePaperPortfolio } from '../paper/engine';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';
import { withTimeout } from '../ops/timeouts';

const log = createComponentLogger('worker:paper');

let isRunning = false;

export function startPaperWorker(): void {
  if (!config.paper.mode) {
    log.info('Paper worker disabled (PAPER_MODE=false)');
    return;
  }

  const intervalMins = Math.max(1, config.scanner.trackingIntervalMinutes);
  const cronExpression = `*/${intervalMins} * * * *`;

  cron.schedule(cronExpression, async () => {
    if (isRunning) {
      log.warn('Paper worker tick skipped — previous run still in progress');
      return;
    }

    isRunning = true;
    try {
      const ideas = await getActiveTradeIdeas();
      for (const idea of ideas) {
        await withTimeout(ensurePaperPositionFromIdea(idea), config.ops.scanTimeoutMs, `paper.open.${idea.ticker}`);
      }

      await withTimeout(updatePaperPortfolio(), config.ops.scanTimeoutMs, 'paper.portfolio.update');
    } catch (error) {
      log.error('Paper worker tick failed', { err: (error as Error).message });
    } finally {
      isRunning = false;
    }
  });

  log.info(`Paper worker started, every ${intervalMins} minute(s)`);
}
