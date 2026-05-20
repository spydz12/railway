import winston from 'winston';
import { config } from '../config';
import * as fs from 'fs';
import * as path from 'path';

const logLevel = config.scanner?.debugSignals ? 'debug' : config.app.logLevel;
const LOG_DIR = 'logs';

type Severity = 'info' | 'warn' | 'error' | 'critical';

interface IntelligenceRecord {
  timestamp: string;
  service: string;
  symbol: string | null;
  strategy: string | null;
  stage: string;
  severity: Severity;
  error: string | null;
  stack: string | null;
  payload: Record<string, unknown>;
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getDailyFilePath(severity: Exclude<Severity, 'info'>): string {
  const today = new Date().toISOString().slice(0, 10);
  if (severity === 'warn') return path.join(LOG_DIR, `warnings-${today}.jsonl`);
  if (severity === 'critical') return path.join(LOG_DIR, `critical-${today}.jsonl`);
  return path.join(LOG_DIR, `errors-${today}.jsonl`);
}

function toMetaObject(meta?: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== 'object') return {};
  return meta as Record<string, unknown>;
}

function toErrorMessage(message: string, meta: Record<string, unknown>, severity: Severity): string | null {
  const err = meta.err;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof meta.error === 'string') return meta.error;
  if (severity === 'error' || severity === 'critical') return message;
  return null;
}

function toErrorStack(meta: Record<string, unknown>): string | null {
  const err = meta.err;
  if (err instanceof Error) return err.stack ?? null;
  if (typeof meta.stack === 'string') return meta.stack;
  return null;
}

function extractSymbol(meta: Record<string, unknown>): string | null {
  const value = meta.symbol ?? meta.ticker;
  return typeof value === 'string' ? value : null;
}

function extractStrategy(meta: Record<string, unknown>): string | null {
  const value = meta.strategy ?? meta.strategy_slug;
  return typeof value === 'string' ? value : null;
}

function captureIntelligence(severity: Exclude<Severity, 'info'>, message: string, meta?: Record<string, unknown>): void {
  try {
    ensureLogDir();
    const payload = toMetaObject(meta);
    const record: IntelligenceRecord = {
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
    fs.appendFile(filePath, `${JSON.stringify(record)}\n`, () => {});
  } catch {
    // Never throw from logging paths.
  }
}

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'trade-bot' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
          const comp = component ? `[${component}]` : '';
          const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} ${level} ${comp} ${message}${metaStr}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

export function logInfo(message: string, meta?: unknown): void {
  logger.info(message, toMetaObject(meta));
}

export function logWarn(message: string, meta?: unknown): void {
  const payload = toMetaObject(meta);
  logger.warn(message, payload);
  captureIntelligence('warn', message, payload);
}

export function logError(message: string, meta?: unknown): void {
  const payload = toMetaObject(meta);
  logger.error(message, payload);
  captureIntelligence('error', message, payload);
}

export function logCritical(message: string, meta?: unknown): void {
  const payload = {
    ...toMetaObject(meta),
    severity: 'critical',
  };
  logger.error(message, payload);
  captureIntelligence('critical', message, payload);
}

export function createComponentLogger(component: string) {
  return {
    debug: (message: string, meta?: unknown) => logger.debug(message, { component, ...toMetaObject(meta) }),
    info: (message: string, meta?: unknown) => logInfo(message, { component, ...toMetaObject(meta) }),
    warn: (message: string, meta?: unknown) => logWarn(message, { component, ...toMetaObject(meta) }),
    error: (message: string, meta?: unknown) => logError(message, { component, ...toMetaObject(meta) }),
    critical: (message: string, meta?: unknown) => logCritical(message, { component, ...toMetaObject(meta) }),
  };
}
