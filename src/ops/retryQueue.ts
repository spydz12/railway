import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('ops:retry-queue');

export interface RetryJob {
  id: string;
  attempts: number;
  maxAttempts: number;
  run: () => Promise<void>;
  nextRunAt: number;
}

export class RetryQueue {
  private readonly queue: RetryJob[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly name: string, private readonly intervalMs = 1000) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  enqueue(job: Omit<RetryJob, 'attempts' | 'nextRunAt'>): void {
    this.queue.push({ ...job, attempts: 0, nextRunAt: Date.now() });
  }

  size(): number {
    return this.queue.length;
  }

  private async tick(): Promise<void> {
    if (this.queue.length === 0) return;

    const now = Date.now();
    const dueJobs = this.queue.filter((job) => job.nextRunAt <= now);

    for (const job of dueJobs) {
      try {
        await job.run();
        this.remove(job.id);
      } catch (error) {
        job.attempts += 1;
        if (job.attempts >= job.maxAttempts) {
          log.error('Retry job exhausted', { queue: this.name, jobId: job.id, err: (error as Error).message });
          this.remove(job.id);
          continue;
        }

        const backoffMs = Math.min(30000, 1000 * Math.pow(2, job.attempts));
        job.nextRunAt = Date.now() + backoffMs;
        log.warn('Retry job failed, rescheduled', {
          queue: this.name,
          jobId: job.id,
          attempts: job.attempts,
          nextInMs: backoffMs,
        });
      }
    }
  }

  private remove(id: string): void {
    const idx = this.queue.findIndex((job) => job.id === id);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
    }
  }
}
