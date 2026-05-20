import { config } from '../config';
import { createComponentLogger } from '../utils/logger';
import { startTrackerWorker } from '../workers/trackerWorker';
import { setRuntimeService } from './state';

const log = createComponentLogger('bootstrap:tracking');

export function startTracking(): boolean {
  if (!config.runtime.enableTracking) {
    log.info('Tracking startup disabled by ENABLE_TRACKING=false');
    setRuntimeService('tracking', false);
    return false;
  }

  startTrackerWorker();
  setRuntimeService('tracking', true);
  log.info('Tracking startup completed');
  return true;
}

if (require.main === module) {
  startTracking();
}
