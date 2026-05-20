import { config } from '../config';
import { createComponentLogger } from '../utils/logger';
import { startScannerWorker } from '../workers/scannerWorker';
import { setRuntimeService } from './state';

const log = createComponentLogger('bootstrap:scanner');

export function startScanner(): boolean {
  if (!config.runtime.enableScanner) {
    log.info('Scanner startup disabled by ENABLE_SCANNER=false');
    setRuntimeService('scanner', false);
    return false;
  }

  startScannerWorker();
  setRuntimeService('scanner', true);
  log.info('Scanner startup completed');
  return true;
}

if (require.main === module) {
  startScanner();
}
