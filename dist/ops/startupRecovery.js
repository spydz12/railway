"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStartupRecovery = runStartupRecovery;
const client_1 = require("../database/client");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('ops:startup-recovery');
async function runStartupRecovery() {
    const db = (0, client_1.getDbClient)();
    const staleCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { error } = await db
        .from('paper_positions')
        .update({
        status: 'closed',
        close_reason: 'startup_recovery_timeout',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    })
        .eq('status', 'open')
        .lt('opened_at', staleCutoff);
    if (error) {
        log.warn('Startup recovery skipped (paper tables may not be migrated yet)', { err: error.message });
    }
}
