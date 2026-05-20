"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScanner = startScanner;
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const scannerWorker_1 = require("../workers/scannerWorker");
const state_1 = require("./state");
const log = (0, logger_1.createComponentLogger)('bootstrap:scanner');
function startScanner() {
    if (!config_1.config.runtime.enableScanner) {
        log.info('Scanner startup disabled by ENABLE_SCANNER=false');
        (0, state_1.setRuntimeService)('scanner', false);
        return false;
    }
    (0, scannerWorker_1.startScannerWorker)();
    (0, state_1.setRuntimeService)('scanner', true);
    log.info('Scanner startup completed');
    return true;
}
if (require.main === module) {
    startScanner();
}
