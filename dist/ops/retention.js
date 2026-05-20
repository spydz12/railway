"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRetentionCleanup = runRetentionCleanup;
exports.refreshStrategyDailyAggregates = refreshStrategyDailyAggregates;
const client_1 = require("../database/client");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('ops:retention');
async function runRetentionCleanup(days = 180) {
    const db = (0, client_1.getDbClient)();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { error: archiveError } = await db.rpc('archive_signal_performance_before', { p_cutoff: cutoff });
    if (archiveError) {
        log.warn('Archive RPC failed, continuing with direct cleanup fallback', { err: archiveError.message });
    }
    const { error: deleteError } = await db
        .from('signal_performance')
        .delete()
        .lt('created_at', cutoff);
    if (deleteError) {
        log.error('Retention cleanup failed', { err: deleteError.message, cutoff });
    }
}
async function refreshStrategyDailyAggregates() {
    const db = (0, client_1.getDbClient)();
    const { error } = await db.rpc('refresh_strategy_daily_aggregates');
    if (error) {
        log.error('Failed to refresh strategy daily aggregates', { err: error.message });
    }
}
