"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorkers = startWorkers;
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const paperWorker_1 = require("../workers/paperWorker");
const state_1 = require("./state");
const log = (0, logger_1.createComponentLogger)('bootstrap:workers');
function startWorkers() {
    if (!config_1.config.runtime.enableWorkers) {
        log.info('Workers startup disabled by ENABLE_WORKERS=false');
        (0, state_1.setRuntimeService)('workers', false);
        return false;
    }
    (0, paperWorker_1.startPaperWorker)();
    (0, state_1.setRuntimeService)('workers', true);
    log.info('Workers startup completed');
    return true;
}
if (require.main === module) {
    startWorkers();
}
