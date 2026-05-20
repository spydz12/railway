"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementCounter = incrementCounter;
exports.timeSync = timeSync;
exports.timeAsync = timeAsync;
exports.recordLatency = recordLatency;
exports.getMetricsSnapshot = getMetricsSnapshot;
exports.logMetricsSummary = logMetricsSummary;
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('observability:metrics');
const latencyByName = new Map();
const counters = {};
function incrementCounter(name, delta = 1) {
    counters[name] = (counters[name] ?? 0) + delta;
}
function timeSync(name, fn) {
    const start = Date.now();
    try {
        return fn();
    }
    finally {
        recordLatency(name, Date.now() - start);
    }
}
async function timeAsync(name, fn) {
    const start = Date.now();
    try {
        return await fn();
    }
    finally {
        recordLatency(name, Date.now() - start);
    }
}
function recordLatency(name, ms) {
    const current = latencyByName.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
    current.count += 1;
    current.totalMs += ms;
    current.maxMs = Math.max(current.maxMs, ms);
    latencyByName.set(name, current);
}
function getMetricsSnapshot() {
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
function logMetricsSummary() {
    const snapshot = getMetricsSnapshot();
    log.info('Metrics snapshot', snapshot);
}
