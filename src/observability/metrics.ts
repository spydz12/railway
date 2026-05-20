import { createComponentLogger } from '../utils/logger';

const log = createComponentLogger('observability:metrics');

interface LatencyMetric {
  count: number;
  totalMs: number;
  maxMs: number;
}

interface CounterMetric {
  [key: string]: number;
}

const latencyByName = new Map<string, LatencyMetric>();
const counters: CounterMetric = {};

export function incrementCounter(name: string, delta = 1): void {
  counters[name] = (counters[name] ?? 0) + delta;
}

export function timeSync<T>(name: string, fn: () => T): T {
  const start = Date.now();
  try {
    return fn();
  } finally {
    recordLatency(name, Date.now() - start);
  }
}

export async function timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    recordLatency(name, Date.now() - start);
  }
}

export function recordLatency(name: string, ms: number): void {
  const current = latencyByName.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
  current.count += 1;
  current.totalMs += ms;
  current.maxMs = Math.max(current.maxMs, ms);
  latencyByName.set(name, current);
}

export function getMetricsSnapshot() {
  const latency = Array.from(latencyByName.entries()).map(([name, metric]) => ({
    name,
    count: metric.count,
    avgMs: metric.count > 0 ? Number((metric.totalMs / metric.count).toFixed(2)) : 0,
    maxMs: Number(metric.maxMs.toFixed(2)),
  }));

  return {
    timestamp: new Date().toISOString(),
    counters: { ...counters },
    latency,
  };
}

export function logMetricsSummary(): void {
  const snapshot = getMetricsSnapshot();
  log.info('Metrics snapshot', snapshot);
}
