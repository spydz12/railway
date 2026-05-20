import { config } from '../config';
import { createComponentLogger } from '../utils/logger';
import { startPaperWorker } from '../workers/paperWorker';
import { setRuntimeService } from './state';

const log = createComponentLogger('bootstrap:workers');

export function startWorkers(): boolean {
  if (!config.runtime.enableWorkers) {
    log.info('Workers startup disabled by ENABLE_WORKERS=false');
    setRuntimeService('workers', false);
    return false;
  }

  startPaperWorker();
  setRuntimeService('workers', true);
  log.info('Workers startup completed');
  return true;
}

if (require.main === module) {
  startWorkers();
}
