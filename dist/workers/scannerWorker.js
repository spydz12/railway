"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScannerWorker = startScannerWorker;
const node_cron_1 = __importDefault(require("node-cron"));
const scanner_1 = require("../scanner");
const cryptoScanner_1 = require("../scanner/cryptoScanner");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const timeouts_1 = require("../ops/timeouts");
const metrics_1 = require("../observability/metrics");
const log = (0, logger_1.createComponentLogger)('worker:scanner');
let isRunningStock = false;
let isRunningCrypto = false;
function startScannerWorker() {
    const intervalMins = Math.max(1, config_1.config.scanner.intervalMinutes);
    const cronExpression = `*/${intervalMins} * * * *`;
    log.info(`Scanner worker starting. Stock interval: every ${intervalMins} minute(s)`);
    node_cron_1.default.schedule(cronExpression, async () => {
        if (isRunningStock) {
            log.warn('Stock scanner tick skipped — previous stock scan still in progress');
            return;
        }
        isRunningStock = true;
        log.info('Stock scanner tick — starting market scan');
        try {
            await (0, metrics_1.timeAsync)('scanner.stock.scan', () => (0, timeouts_1.withTimeout)((0, scanner_1.runScan)(), config_1.config.ops.scanTimeoutMs, 'stock_scan'));
        }
        catch (err) {
            (0, metrics_1.incrementCounter)('scanner.stock.errors');
            log.error('Stock scanner worker error', { err: err.message });
        }
        finally {
            isRunningStock = false;
        }
    });
    if (config_1.config.crypto.enabled) {
        const cryptoIntervalMins = Math.max(1, config_1.config.crypto.intervalMinutes);
        const cryptoCron = `*/${cryptoIntervalMins} * * * *`;
        log.info(`Crypto scanner worker starting. Interval: every ${cryptoIntervalMins} minute(s)`);
        node_cron_1.default.schedule(cryptoCron, async () => {
            if (isRunningCrypto) {
                log.warn('Crypto scanner tick skipped — previous crypto scan still in progress');
                return;
            }
            isRunningCrypto = true;
            log.info('Crypto scanner tick — starting crypto scan');
            try {
                await (0, metrics_1.timeAsync)('scanner.crypto.scan', () => (0, timeouts_1.withTimeout)((0, cryptoScanner_1.runCryptoScan)(), config_1.config.ops.cryptoScanTimeoutMs, 'crypto_scan'));
            }
            catch (err) {
                (0, metrics_1.incrementCounter)('scanner.crypto.errors');
                log.error('Crypto scanner worker error', { err: err.message });
            }
            finally {
                isRunningCrypto = false;
            }
        });
    }
}
