"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryQueue = void 0;
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('ops:retry-queue');
class RetryQueue {
    constructor(name, intervalMs = 1000) {
        this.name = name;
        this.intervalMs = intervalMs;
        this.queue = [];
        this.timer = null;
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.tick();
        }, this.intervalMs);
    }
    stop() {
        if (!this.timer)
            return;
        clearInterval(this.timer);
        this.timer = null;
    }
    enqueue(job) {
        this.queue.push({ ...job, attempts: 0, nextRunAt: Date.now() });
    }
    size() {
        return this.queue.length;
    }
    async tick() {
        if (this.queue.length === 0)
            return;
        const now = Date.now();
        const dueJobs = this.queue.filter((job) => job.nextRunAt <= now);
        for (const job of dueJobs) {
            try {
                await job.run();
                this.remove(job.id);
            }
            catch (error) {
                job.attempts += 1;
                if (job.attempts >= job.maxAttempts) {
                    log.error('Retry job exhausted', { queue: this.name, jobId: job.id, err: error.message });
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
    remove(id) {
        const idx = this.queue.findIndex((job) => job.id === id);
        if (idx >= 0) {
            this.queue.splice(idx, 1);
        }
    }
}
exports.RetryQueue = RetryQueue;
