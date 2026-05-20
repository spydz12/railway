"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOpsWorker = startOpsWorker;
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = require("../utils/logger");
const retention_1 = require("../ops/retention");
const healthMonitor_1 = require("../ops/healthMonitor");
const config_1 = require("../config");
const log = (0, logger_1.createComponentLogger)('worker:ops');
function startOpsWorker() {
    node_cron_1.default.schedule('*/5 * * * *', async () => {
        await (0, healthMonitor_1.runHealthMonitor)();
    });
    node_cron_1.default.schedule('0 */6 * * *', async () => {
        await (0, retention_1.refreshStrategyDailyAggregates)();
    });
    node_cron_1.default.schedule('30 2 * * *', async () => {
        await (0, retention_1.runRetentionCleanup)(config_1.config.ops.retentionDays);
    });
    log.info('Ops worker started (health monitor + aggregation + retention)');
}
