"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTrackerWorker = startTrackerWorker;
const node_cron_1 = __importDefault(require("node-cron"));
const queries_1 = require("../database/queries");
const monitor_1 = require("../tracking/monitor");
const bot_1 = require("../telegram/bot");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const timeouts_1 = require("../ops/timeouts");
const metrics_1 = require("../observability/metrics");
const log = (0, logger_1.createComponentLogger)('worker:tracker');
let isRunning = false;
async function trackIdea(idea) {
    try {
        const result = await (0, metrics_1.timeAsync)('tracker.check_trade', () => (0, timeouts_1.withTimeout)((0, monitor_1.checkTradeIdea)(idea), config_1.config.ops.scanTimeoutMs, `track.${idea.ticker}`));
        if (!result.event)
            return;
        log.info(`Tracking event: ${idea.ticker} — ${result.event} @ $${result.currentPrice}`);
        await (0, metrics_1.timeAsync)('tracker.apply_event', () => (0, monitor_1.applyTrackingEvent)(idea, result.event, result.currentPrice, async (tradeIdea, event, price) => {
            await (0, bot_1.sendTradeUpdate)(tradeIdea, event, price);
        }));
    }
    catch (err) {
        (0, metrics_1.incrementCounter)('tracker.errors');
        log.error(`Error tracking idea ${idea.id} (${idea.ticker})`, {
            err: err.message,
        });
    }
}
function startTrackerWorker() {
    const intervalMins = Math.max(1, config_1.config.scanner.trackingIntervalMinutes);
    const cronExpression = `*/${intervalMins} * * * *`;
    log.info(`Tracker worker starting. Interval: every ${intervalMins} minute(s)`);
    node_cron_1.default.schedule(cronExpression, async () => {
        // Guard: skip this tick if the previous tracking run is still in progress.
        if (isRunning) {
            log.warn('Tracker tick skipped — previous run still in progress');
            return;
        }
        isRunning = true;
        log.debug('Tracker tick — checking active ideas');
        try {
            const activeIdeas = await (0, queries_1.getActiveTradeIdeas)();
            if (activeIdeas.length === 0) {
                return;
            }
            log.info(`Tracking ${activeIdeas.length} active trade idea(s)`);
            // Process ideas sequentially to avoid hammering the provider API
            // and to maintain a clear audit trail in logs
            for (const idea of activeIdeas) {
                await trackIdea(idea);
            }
        }
        catch (err) {
            log.error('Tracker worker error', { err: err.message });
        }
        finally {
            isRunning = false;
        }
    });
}
