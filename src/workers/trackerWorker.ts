import cron from 'node-cron';
import { getActiveTradeIdeas, TradeIdea } from '../database/queries';
import { checkTradeIdea, applyTrackingEvent, TrackingEvent } from '../tracking/monitor';
import { sendTradeUpdate } from '../telegram/bot';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';
import { withTimeout } from '../ops/timeouts';
import { incrementCounter, timeAsync } from '../observability/metrics';

const log = createComponentLogger('worker:tracker');

let isRunning = false;

async function trackIdea(idea: TradeIdea): Promise<void> {
  try {
    const result = await timeAsync('tracker.check_trade', () =>
      withTimeout(checkTradeIdea(idea), config.ops.scanTimeoutMs, `track.${idea.ticker}`)
    );
    if (!result.event) return;

    log.info(`Tracking event: ${idea.ticker} — ${result.event} @ $${result.currentPrice}`);

    await timeAsync('tracker.apply_event', () => applyTrackingEvent(
      idea,
      result.event as TrackingEvent,
      result.currentPrice,
      async (tradeIdea, event, price) => {
        await sendTradeUpdate(tradeIdea, event, price);
      }
    ));
  } catch (err: unknown) {
    incrementCounter('tracker.errors');
    log.error(`Error tracking idea ${idea.id} (${idea.ticker})`, {
      err: (err as Error).message,
    });
  }
}

export function startTrackerWorker(): void {
  const intervalMins = Math.max(1, config.scanner.trackingIntervalMinutes);
  const cronExpression = `*/${intervalMins} * * * *`;

  log.info(`Tracker worker starting. Interval: every ${intervalMins} minute(s)`);

  cron.schedule(cronExpression, async () => {
    // Guard: skip this tick if the previous tracking run is still in progress.
    if (isRunning) {
      log.warn('Tracker tick skipped — previous run still in progress');
      return;
    }
    isRunning = true;
    log.debug('Tracker tick — checking active ideas');
    try {
      const activeIdeas = await getActiveTradeIdeas();
      if (activeIdeas.length === 0) {
        return;
      }
      log.info(`Tracking ${activeIdeas.length} active trade idea(s)`);
      // Process ideas sequentially to avoid hammering the provider API
      // and to maintain a clear audit trail in logs
      for (const idea of activeIdeas) {
        await trackIdea(idea);
      }
    } catch (err: unknown) {
      log.error('Tracker worker error', { err: (err as Error).message });
    } finally {
      isRunning = false;
    }
  });
}
