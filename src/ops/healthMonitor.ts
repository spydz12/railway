import { getProvider, getProviderStatus, getQuoteWithFailover } from '../providers';
import { createComponentLogger } from '../utils/logger';
import { timeAsync } from '../observability/metrics';

const log = createComponentLogger('ops:health-monitor');

export async function runHealthMonitor(): Promise<void> {
  const providerStatus = getProviderStatus();
  const active = getProvider();

  await timeAsync('health.provider_quote_latency', async () => {
    const quote = await getQuoteWithFailover('SPY', 'stocks');
    if (!quote) {
      throw new Error(`Health quote failed for provider ${active.name}`);
    }
  }).catch((error) => {
    log.error('Provider health check failed', { err: (error as Error).message, provider: active.name, providerStatus });
  });
}
