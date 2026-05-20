"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHealthMonitor = runHealthMonitor;
const providers_1 = require("../providers");
const logger_1 = require("../utils/logger");
const metrics_1 = require("../observability/metrics");
const log = (0, logger_1.createComponentLogger)('ops:health-monitor');
async function runHealthMonitor() {
    const providerStatus = (0, providers_1.getProviderStatus)();
    const active = (0, providers_1.getProvider)();
    await (0, metrics_1.timeAsync)('health.provider_quote_latency', async () => {
        const quote = await (0, providers_1.getQuoteWithFailover)('SPY', 'stocks');
        if (!quote) {
            throw new Error(`Health quote failed for provider ${active.name}`);
        }
    }).catch((error) => {
        log.error('Provider health check failed', { err: error.message, provider: active.name, providerStatus });
    });
}
