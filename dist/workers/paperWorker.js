"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPaperWorker = startPaperWorker;
const node_cron_1 = __importDefault(require("node-cron"));
const queries_1 = require("../database/queries");
const engine_1 = require("../paper/engine");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const timeouts_1 = require("../ops/timeouts");
const log = (0, logger_1.createComponentLogger)('worker:paper');
let isRunning = false;
function startPaperWorker() {
    if (!config_1.config.paper.mode) {
        log.info('Paper worker disabled (PAPER_MODE=false)');
        return;
    }
    const intervalMins = Math.max(1, config_1.config.scanner.trackingIntervalMinutes);
    const cronExpression = `*/${intervalMins} * * * *`;
    node_cron_1.default.schedule(cronExpression, async () => {
        if (isRunning) {
            log.warn('Paper worker tick skipped — previous run still in progress');
            return;
        }
        isRunning = true;
        try {
            const ideas = await (0, queries_1.getActiveTradeIdeas)();
            for (const idea of ideas) {
                await (0, timeouts_1.withTimeout)((0, engine_1.ensurePaperPositionFromIdea)(idea), config_1.config.ops.scanTimeoutMs, `paper.open.${idea.ticker}`);
            }
            await (0, timeouts_1.withTimeout)((0, engine_1.updatePaperPortfolio)(), config_1.config.ops.scanTimeoutMs, 'paper.portfolio.update');
        }
        catch (error) {
            log.error('Paper worker tick failed', { err: error.message });
        }
        finally {
            isRunning = false;
        }
    });
    log.info(`Paper worker started, every ${intervalMins} minute(s)`);
}
