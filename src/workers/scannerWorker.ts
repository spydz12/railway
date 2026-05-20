import cron from 'node-cron';
import { runScan } from '../scanner';
import { runCryptoScan } from '../scanner/cryptoScanner';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';
import { withTimeout } from '../ops/timeouts';
import { incrementCounter, timeAsync } from '../observability/metrics';

const log = createComponentLogger('worker:scanner');

let isRunningStock = false;
let isRunningCrypto = false;

export function startScannerWorker(): void {
  const intervalMins = Math.max(1, config.scanner.intervalMinutes);
  const cronExpression = `*/${intervalMins} * * * *`;

  log.info(`Scanner worker starting. Stock interval: every ${intervalMins} minute(s)`);

  cron.schedule(cronExpression, async () => {
    if (isRunningStock) {
      log.warn('Stock scanner tick skipped — previous stock scan still in progress');
      return;
    }
    isRunningStock = true;
    log.info('Stock scanner tick — starting market scan');
    try {
        await timeAsync('scanner.stock.scan', () =>
          withTimeout(runScan(), config.ops.scanTimeoutMs, 'stock_scan')
        );
    } catch (err: unknown) {
        incrementCounter('scanner.stock.errors');
      log.error('Stock scanner worker error', { err: (err as Error).message });
    } finally {
      isRunningStock = false;
    }
  });

  if (config.crypto.enabled) {
    const cryptoIntervalMins = Math.max(1, config.crypto.intervalMinutes);
    const cryptoCron = `*/${cryptoIntervalMins} * * * *`;

    log.info(`Crypto scanner worker starting. Interval: every ${cryptoIntervalMins} minute(s)`);

    cron.schedule(cryptoCron, async () => {
      if (isRunningCrypto) {
        log.warn('Crypto scanner tick skipped — previous crypto scan still in progress');
        return;
      }
      isRunningCrypto = true;
      log.info('Crypto scanner tick — starting crypto scan');
      try {
        await timeAsync('scanner.crypto.scan', () =>
          withTimeout(runCryptoScan(), config.ops.cryptoScanTimeoutMs, 'crypto_scan')
        );
      } catch (err: unknown) {
        incrementCounter('scanner.crypto.errors');
        log.error('Crypto scanner worker error', { err: (err as Error).message });
      } finally {
        isRunningCrypto = false;
      }
    });
  }
}
