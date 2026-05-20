"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCron = startCron;
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const opsWorker_1 = require("../workers/opsWorker");
const state_1 = require("./state");
const log = (0, logger_1.createComponentLogger)('bootstrap:cron');
function startCron() {
    if (!config_1.config.runtime.enableCron) {
        log.info('Cron startup disabled by ENABLE_CRON=false');
        (0, state_1.setRuntimeService)('cron', false);
        return false;
    }
    (0, opsWorker_1.startOpsWorker)();
    (0, state_1.setRuntimeService)('cron', true);
    log.info('Cron startup completed');
    return true;
}
if (require.main === module) {
    startCron();
}
