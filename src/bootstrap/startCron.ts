import { config } from '../config';
import { createComponentLogger } from '../utils/logger';
import { startOpsWorker } from '../workers/opsWorker';
import { setRuntimeService } from './state';

const log = createComponentLogger('bootstrap:cron');

export function startCron(): boolean {
  if (!config.runtime.enableCron) {
    log.info('Cron startup disabled by ENABLE_CRON=false');
    setRuntimeService('cron', false);
    return false;
  }

  startOpsWorker();
  setRuntimeService('cron', true);
  log.info('Cron startup completed');
  return true;
}

if (require.main === module) {
  startCron();
}
