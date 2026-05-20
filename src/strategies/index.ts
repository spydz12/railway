import { Strategy } from './base';
import { TrendPullbackStrategy } from './trendPullback';
import { BreakoutVolumeStrategy } from './breakoutVolume';
import { SupportBounceStrategy } from './supportBounce';
import { VWAPReclaimStrategy } from './vwap';
import { ORBStrategy } from './orb';
import { EMACloudTrendStrategy } from './trend';
import { MeanReversionStrategy } from './meanReversion';
import { config } from '../config';

export { EMPTY_RESULT } from './base';
export type { Strategy, StrategyResult } from './base';

const ALL_STRATEGIES: Strategy[] = [
  new TrendPullbackStrategy(),
  new BreakoutVolumeStrategy(),
  new SupportBounceStrategy(),
  new VWAPReclaimStrategy(),
  new ORBStrategy(),
  new EMACloudTrendStrategy(),
  new MeanReversionStrategy(),
];

export function getEnabledStrategies(): Strategy[] {
  const enabled = config.scanner.enabledStrategies;
  return ALL_STRATEGIES.filter((s) => enabled.includes(s.slug));
}

export function getStrategyBySlug(slug: string): Strategy | undefined {
  return ALL_STRATEGIES.find((s) => s.slug === slug);
}
