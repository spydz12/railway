"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrap = bootstrap;
require("dotenv/config");
const fs = __importStar(require("fs"));
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const env_1 = require("../config/env");
const bot_1 = require("../telegram/bot");
const providers_1 = require("../providers");
const api_1 = require("../api");
const startupRecovery_1 = require("../ops/startupRecovery");
const metrics_1 = require("../observability/metrics");
const strategies_1 = require("../strategies");
const crypto_1 = require("../strategies/crypto");
const queries_1 = require("../database/queries");
const client_1 = require("../database/client");
const startScanner_1 = require("./startScanner");
const startTracking_1 = require("./startTracking");
const startWorkers_1 = require("./startWorkers");
const startCron_1 = require("./startCron");
const state_1 = require("./state");
let memoryGuardTimer = null;
let heartbeatTimer = null;
async function validateStrategySlugRegistry() {
    const emittedSlugs = Array.from(new Set([
        ...(0, strategies_1.getEnabledStrategies)().map((strategy) => strategy.slug),
        ...(0, crypto_1.getEnabledCryptoStrategies)().map((strategy) => strategy.slug),
    ]));
    const registered = await (0, queries_1.getRegisteredStrategySlugs)();
    const registeredSet = new Set(registered);
    const missing = emittedSlugs.filter((slug) => !registeredSet.has(slug));
    if (missing.length > 0) {
        logger_1.logger.error('[MISSING_STRATEGY_SLUG]', {
            missing,
            emittedCount: emittedSlugs.length,
            registeredCount: registered.length,
        });
        return;
    }
    logger_1.logger.info('[STRATEGY_SLUG_VALIDATION_OK]', {
        emittedCount: emittedSlugs.length,
        registeredCount: registered.length,
    });
}
function startMemoryGuard() {
    if (memoryGuardTimer)
        return;
    memoryGuardTimer = setInterval(() => {
        const rssMb = process.memoryUsage().rss / (1024 * 1024);
        if (rssMb > config_1.config.ops.memoryLimitMb) {
            logger_1.logger.error('Memory usage exceeded configured limit', {
                rssMb: Number(rssMb.toFixed(2)),
                limitMb: config_1.config.ops.memoryLimitMb,
            });
            (0, metrics_1.incrementCounter)('system.memory_limit_exceeded');
        }
    }, 60000);
}
function startHeartbeat() {
    (0, state_1.touchHeartbeat)();
    if (heartbeatTimer)
        clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
        (0, state_1.touchHeartbeat)();
    }, 30000);
}
async function checkDatabaseHealth() {
    try {
        const db = (0, client_1.getDbClient)();
        await db.from('trade_ideas').select('id').limit(1);
        (0, state_1.setRuntimeService)('database', true);
        return true;
    }
    catch {
        (0, state_1.setRuntimeService)('database', false);
        return false;
    }
}
async function bootstrap() {
    try {
        process.env.ENABLE_SCANNER = process.env.ENABLE_SCANNER ?? 'true';
        process.env.ENABLE_TRACKING = process.env.ENABLE_TRACKING ?? 'true';
        process.env.ENABLE_WORKERS = process.env.ENABLE_WORKERS ?? 'true';
        process.env.ENABLE_CRON = process.env.ENABLE_CRON ?? 'true';
        logger_1.logger.info('='.repeat(60));
        logger_1.logger.info('AI Stock Trade Ideas Bot — Starting up (bootstrap)');
        logger_1.logger.info('='.repeat(60));
        (0, env_1.validateDeploymentEnv)();
        (0, config_1.validateRuntimeEnvironment)();
        logger_1.logger.info('[BOOTSTRAP_START]', {
            scanner: config_1.config.runtime.enableScanner,
            tracking: config_1.config.runtime.enableTracking,
            workers: config_1.config.runtime.enableWorkers,
            cron: config_1.config.runtime.enableCron,
            mode: config_1.config.app.nodeEnv,
        });
        logger_1.logger.info(`Environment: ${config_1.config.app.nodeEnv}`);
        logger_1.logger.info(`Market data provider: ${config_1.config.marketData.provider}`);
        logger_1.logger.info(`ENABLE_SCANNER=${config_1.config.runtime.enableScanner}`);
        logger_1.logger.info(`ENABLE_TRACKING=${config_1.config.runtime.enableTracking}`);
        logger_1.logger.info(`ENABLE_WORKERS=${config_1.config.runtime.enableWorkers}`);
        logger_1.logger.info(`ENABLE_CRON=${config_1.config.runtime.enableCron}`);
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs', { recursive: true });
        }
        try {
            const provider = (0, providers_1.getProvider)();
            logger_1.logger.info(`Market data provider active: ${provider.name}`);
        }
        catch (err) {
            logger_1.logger.error('Failed to initialize market data provider', {
                err: err.message,
            });
            process.exit(1);
        }
        const telegramOk = await (0, bot_1.testConnection)();
        (0, state_1.setRuntimeService)('telegram', telegramOk);
        if (!telegramOk) {
            logger_1.logger.error('Telegram connection failed. Please check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
            process.exit(1);
        }
        await checkDatabaseHealth();
        await (0, api_1.startApiServer)();
        await (0, startupRecovery_1.runStartupRecovery)();
        await validateStrategySlugRegistry();
        const scannerStarted = (0, startScanner_1.startScanner)();
        logger_1.logger.info('[BOOTSTRAP_SERVICE_STARTED]', { service: 'scanner', started: scannerStarted });
        const trackingStarted = (0, startTracking_1.startTracking)();
        logger_1.logger.info('[BOOTSTRAP_SERVICE_STARTED]', { service: 'tracking', started: trackingStarted });
        const workersStarted = (0, startWorkers_1.startWorkers)();
        logger_1.logger.info('[BOOTSTRAP_SERVICE_STARTED]', { service: 'workers', started: workersStarted });
        const cronStarted = (0, startCron_1.startCron)();
        logger_1.logger.info('[BOOTSTRAP_SERVICE_STARTED]', { service: 'cron', started: cronStarted });
        startMemoryGuard();
        startHeartbeat();
        logger_1.logger.info('[BOOTSTRAP_READY]', {
            scanner: scannerStarted,
            tracking: trackingStarted,
            workers: workersStarted,
            cron: cronStarted,
            mode: config_1.config.app.nodeEnv,
        });
        logger_1.logger.info('='.repeat(60));
        logger_1.logger.info('Bootstrap complete. Services are running based on ENABLE_* flags.');
        logger_1.logger.info('='.repeat(60));
    }
    catch (err) {
        const message = err?.message ?? 'Unknown bootstrap failure';
        const missingEnv = message.startsWith('Missing required deployment environment variables: ')
            ? message.replace('Missing required deployment environment variables: ', '').split(',').map((x) => x.trim()).filter(Boolean)
            : [];
        logger_1.logger.error('[BOOTSTRAP_FAILED]', {
            mode: config_1.config.app.nodeEnv,
            error: message,
            missingEnv,
        });
        throw err;
    }
}
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT received — shutting down gracefully');
    if (memoryGuardTimer)
        clearInterval(memoryGuardTimer);
    if (heartbeatTimer)
        clearInterval(heartbeatTimer);
    (0, metrics_1.logMetricsSummary)();
    process.exit(0);
});
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM received — shutting down gracefully');
    if (memoryGuardTimer)
        clearInterval(memoryGuardTimer);
    if (heartbeatTimer)
        clearInterval(heartbeatTimer);
    (0, metrics_1.logMetricsSummary)();
    process.exit(0);
});
process.on('uncaughtException', (err) => {
    (0, logger_1.logCritical)('Uncaught exception', { stage: 'bootstrap', err: err.message, stack: err.stack });
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    (0, logger_1.logCritical)('Unhandled promise rejection', { stage: 'bootstrap', error: String(reason) });
});
if (require.main === module) {
    bootstrap().catch(() => {
        process.exit(1);
    });
}
