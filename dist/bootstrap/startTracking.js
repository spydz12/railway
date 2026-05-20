"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTracking = startTracking;
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const trackerWorker_1 = require("../workers/trackerWorker");
const state_1 = require("./state");
const log = (0, logger_1.createComponentLogger)('bootstrap:tracking');
function startTracking() {
    if (!config_1.config.runtime.enableTracking) {
        log.info('Tracking startup disabled by ENABLE_TRACKING=false');
        (0, state_1.setRuntimeService)('tracking', false);
        return false;
    }
    (0, trackerWorker_1.startTrackerWorker)();
    (0, state_1.setRuntimeService)('tracking', true);
    log.info('Tracking startup completed');
    return true;
}
if (require.main === module) {
    startTracking();
}
