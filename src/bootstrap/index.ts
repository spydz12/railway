import 'dotenv/config';
import * as fs from 'fs';
import { logger, logCritical } from '../utils/logger';
import { config, validateRuntimeEnvironment } from '../config';
import { validateDeploymentEnv } from '../config/env';
import { testConnection } from '../telegram/bot';
import { getCryptoProvider, getProvider } from '../providers';
import { startApiServer } from '../api';
import { runStartupRecovery } from '../ops/startupRecovery';
import { incrementCounter, logMetricsSummary } from '../observability/metrics';
import { getEnabledStrategies } from '../strategies';
import { getEnabledCryptoStrategies } from '../strategies/crypto';
import { getRegisteredStrategySlugs } from '../database/queries';
import { getDbClient } from '../database/client';
import { startScanner } from './startScanner';
import { startTracking } from './startTracking';
import { startWorkers } from './startWorkers';
import { startCron } from './startCron';
import { setRuntimeService, touchHeartbeat } from './state';

let memoryGuardTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

async function validateStrategySlugRegistry(): Promise<void> {
  const emittedSlugs = Array.from(new Set([
    ...getEnabledStrategies().map((strategy) => strategy.slug),
    ...getEnabledCryptoStrategies().map((strategy) => strategy.slug),
  ]));

  const registered = await getRegisteredStrategySlugs();
  const registeredSet = new Set(registered);
  const missing = emittedSlugs.filter((slug) => !registeredSet.has(slug));

  if (missing.length > 0) {
    logger.error('[MISSING_STRATEGY_SLUG]', {
      missing,
      emittedCount: emittedSlugs.length,
      registeredCount: registered.length,
    });
    return;
  }

  logger.info('[STRATEGY_SLUG_VALIDATION_OK]', {
    emittedCount: emittedSlugs.length,
    registeredCount: registered.length,
  });
}

function startMemoryGuard(): void {
  if (memoryGuardTimer) return;
  memoryGuardTimer = setInterval(() => {
    const rssMb = process.memoryUsage().rss / (1024 * 1024);
    if (rssMb > config.ops.memoryLimitMb) {
      logger.error('Memory usage exceeded configured limit', {
        rssMb: Number(rssMb.toFixed(2)),
        limitMb: config.ops.memoryLimitMb,
      });
      incrementCounter('system.memory_limit_exceeded');
    }
  }, 60_000);
}

function startHeartbeat(): void {
  touchHeartbeat();
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    touchHeartbeat();
  }, 30_000);
}

async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const db = getDbClient();
    await db.from('trade_ideas').select('id').limit(1);
    setRuntimeService('database', true);
    return true;
  } catch {
    setRuntimeService('database', false);
    return false;
  }
}

export async function bootstrap(): Promise<void> {
  try {
    process.env.ENABLE_SCANNER = process.env.ENABLE_SCANNER ?? 'true';
    process.env.ENABLE_TRACKING = process.env.ENABLE_TRACKING ?? 'true';
    process.env.ENABLE_WORKERS = process.env.ENABLE_WORKERS ?? 'true';
    process.env.ENABLE_CRON = process.env.ENABLE_CRON ?? 'true';

    logger.info('='.repeat(60));
    logger.info('AI Stock Trade Ideas Bot — Starting up (bootstrap)');
    logger.info('='.repeat(60));

    validateDeploymentEnv();
    validateRuntimeEnvironment();

    logger.info('[BOOTSTRAP_START]', {
      scanner: config.runtime.enableScanner,
      tracking: config.runtime.enableTracking,
      workers: config.runtime.enableWorkers,
      cron: config.runtime.enableCron,
      mode: config.app.nodeEnv,
    });

    logger.info(`Environment: ${config.app.nodeEnv}`);
    logger.info(`Market data provider: ${config.marketData.provider}`);
    logger.info(`ENABLE_SCANNER=${config.runtime.enableScanner}`);
    logger.info(`ENABLE_TRACKING=${config.runtime.enableTracking}`);
    logger.info(`ENABLE_WORKERS=${config.runtime.enableWorkers}`);
    logger.info(`ENABLE_CRON=${config.runtime.enableCron}`);

    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs', { recursive: true });
    }

    try {
      if (process.env.ENABLE_STOCKS === 'false' || !config.stocks.enabled) {
        logger.info('ENABLE_STOCKS=false detected, bypassing stock provider initialization');
        if (config.crypto.enabled) {
          const cryptoProvider = getCryptoProvider();
          logger.info(`Crypto provider active: ${cryptoProvider.name}`);
        }
      } else {
        const provider = getProvider();
        logger.info(`Market data provider active: ${provider.name}`);
      }
    } catch (err: unknown) {
      logger.error('Failed to initialize market data provider', {
        err: (err as Error).message,
      });
      process.exit(1);
    }

    const telegramOk = await testConnection();
    setRuntimeService('telegram', telegramOk);
    if (!telegramOk) {
      logger.error('Telegram connection failed. Please check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.');
      process.exit(1);
    }

    await checkDatabaseHealth();
    await startApiServer();
    await runStartupRecovery();
    await validateStrategySlugRegistry();

    const scannerStarted = startScanner();
    logger.info('[BOOTSTRAP_SERVICE_STARTED]', { service: 'scanner', started: scannerStarted });

    const trackingStarted = startTracking();
    logger.info('[BOOTSTRAP_SERVICE_STARTED]', { service: 'tracking', started: trackingStarted });

    const workersStarted = startWorkers();
    logger.info('[BOOTSTRAP_SERVICE_STARTED]', { service: 'workers', started: workersStarted });

    const cronStarted = startCron();
    logger.info('[BOOTSTRAP_SERVICE_STARTED]', { service: 'cron', started: cronStarted });

    startMemoryGuard();
    startHeartbeat();

    logger.info('[BOOTSTRAP_READY]', {
      scanner: scannerStarted,
      tracking: trackingStarted,
      workers: workersStarted,
      cron: cronStarted,
      mode: config.app.nodeEnv,
    });

    logger.info('='.repeat(60));
    logger.info('Bootstrap complete. Services are running based on ENABLE_* flags.');
    logger.info('='.repeat(60));
  } catch (err: unknown) {
    const message = (err as Error)?.message ?? 'Unknown bootstrap failure';
    const missingEnv = message.startsWith('Missing required deployment environment variables: ')
      ? message.replace('Missing required deployment environment variables: ', '').split(',').map((x) => x.trim()).filter(Boolean)
      : [];
    logger.error('[BOOTSTRAP_FAILED]', {
      mode: config.app.nodeEnv,
      error: message,
      missingEnv,
    });
    throw err;
  }
}

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  if (memoryGuardTimer) clearInterval(memoryGuardTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  logMetricsSummary();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  if (memoryGuardTimer) clearInterval(memoryGuardTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  logMetricsSummary();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logCritical('Uncaught exception', { stage: 'bootstrap', err: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logCritical('Unhandled promise rejection', { stage: 'bootstrap', error: String(reason) });
});

if (require.main === module) {
  bootstrap().catch(() => {
    process.exit(1);
  });
}
