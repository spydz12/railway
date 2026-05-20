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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logInfo = logInfo;
exports.logWarn = logWarn;
exports.logError = logError;
exports.logCritical = logCritical;
exports.createComponentLogger = createComponentLogger;
const winston_1 = __importDefault(require("winston"));
const config_1 = require("../config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logLevel = config_1.config.scanner?.debugSignals ? 'debug' : config_1.config.app.logLevel;
const LOG_DIR = 'logs';
function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}
function getDailyFilePath(severity) {
    const today = new Date().toISOString().slice(0, 10);
    if (severity === 'warn')
        return path.join(LOG_DIR, `warnings-${today}.jsonl`);
    if (severity === 'critical')
        return path.join(LOG_DIR, `critical-${today}.jsonl`);
    return path.join(LOG_DIR, `errors-${today}.jsonl`);
}
function toMetaObject(meta) {
    if (!meta || typeof meta !== 'object')
        return {};
    return meta;
}
function toErrorMessage(message, meta, severity) {
    const err = meta.err;
    if (typeof err === 'string')
        return err;
    if (err instanceof Error)
        return err.message;
    if (typeof meta.error === 'string')
        return meta.error;
    if (severity === 'error' || severity === 'critical')
        return message;
    return null;
}
function toErrorStack(meta) {
    const err = meta.err;
    if (err instanceof Error)
        return err.stack ?? null;
    if (typeof meta.stack === 'string')
        return meta.stack;
    return null;
}
function extractSymbol(meta) {
    const value = meta.symbol ?? meta.ticker;
    return typeof value === 'string' ? value : null;
}
function extractStrategy(meta) {
    const value = meta.strategy ?? meta.strategy_slug;
    return typeof value === 'string' ? value : null;
}
function captureIntelligence(severity, message, meta) {
    try {
        ensureLogDir();
        const payload = toMetaObject(meta);
        const record = {
            timestamp: new Date().toISOString(),
            service: typeof payload.service === 'string' ? payload.service : 'trade-bot',
            symbol: extractSymbol(payload),
            strategy: extractStrategy(payload),
            stage: typeof payload.component === 'string' ? payload.component : (typeof payload.stage === 'string' ? payload.stage : 'system'),
            severity,
            error: toErrorMessage(message, payload, severity),
            stack: toErrorStack(payload),
            payload,
        };
        const filePath = getDailyFilePath(severity);
        fs.appendFile(filePath, `${JSON.stringify(record)}\n`, () => { });
    }
    catch {
        // Never throw from logging paths.
    }
}
exports.logger = winston_1.default.createLogger({
    level: logLevel,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    defaultMeta: { service: 'trade-bot' },
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf(({ timestamp, level, message, component, ...meta }) => {
                const comp = component ? `[${component}]` : '';
                const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
                return `${timestamp} ${level} ${comp} ${message}${metaStr}`;
            })),
        }),
        new winston_1.default.transports.File({
            filename: 'logs/error.log',
            level: 'error',
        }),
        new winston_1.default.transports.File({
            filename: 'logs/combined.log',
        }),
    ],
});
function logInfo(message, meta) {
    exports.logger.info(message, toMetaObject(meta));
}
function logWarn(message, meta) {
    const payload = toMetaObject(meta);
    exports.logger.warn(message, payload);
    captureIntelligence('warn', message, payload);
}
function logError(message, meta) {
    const payload = toMetaObject(meta);
    exports.logger.error(message, payload);
    captureIntelligence('error', message, payload);
}
function logCritical(message, meta) {
    const payload = {
        ...toMetaObject(meta),
        severity: 'critical',
    };
    exports.logger.error(message, payload);
    captureIntelligence('critical', message, payload);
}
function createComponentLogger(component) {
    return {
        debug: (message, meta) => exports.logger.debug(message, { component, ...toMetaObject(meta) }),
        info: (message, meta) => logInfo(message, { component, ...toMetaObject(meta) }),
        warn: (message, meta) => logWarn(message, { component, ...toMetaObject(meta) }),
        error: (message, meta) => logError(message, { component, ...toMetaObject(meta) }),
        critical: (message, meta) => logCritical(message, { component, ...toMetaObject(meta) }),
    };
}
