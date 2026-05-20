import { Strategy } from '../base';
import { CryptoMomentumBreakoutStrategy } from './momentumBreakout';
import { CryptoVWAPReclaimStrategy } from './vwapReclaim';
import { CryptoEMATrendCloudStrategy } from './emaTrendCloud';
import { CryptoLiquiditySweepReversalStrategy } from './liquiditySweepReversal';
import { CryptoRSIBollingerReversionStrategy } from './rsiBollingerReversion';
import { CryptoMarketRegimeGridStrategy } from './crypto_market_regime_grid';
import { CryptoBtcMarketLeaderStrategy } from './crypto_btc_market_leader';
import { CryptoAdaptiveMomentumStrategy } from './crypto_adaptive_momentum';
import { CryptoScalpMicroBreakoutStrategy } from './crypto_scalp_microbreakout';
import { CryptoLiquidityImbalanceStrategy } from './crypto_liquidity_imbalance';
import { CryptoDynamicDcaReversalStrategy } from './crypto_dynamic_dca_reversal';
import { calculateBtcTrendBias } from './btcLeaderFilter';
import { setBtcContextCandles } from './crypto_btc_market_leader';
import { config } from '../../config';

const ALL_CRYPTO_STRATEGIES: Strategy[] = [
  new CryptoMomentumBreakoutStrategy(),
  new CryptoVWAPReclaimStrategy(),
  new CryptoEMATrendCloudStrategy(),
  new CryptoLiquiditySweepReversalStrategy(),
  new CryptoRSIBollingerReversionStrategy(),
  new CryptoMarketRegimeGridStrategy(),
  new CryptoBtcMarketLeaderStrategy(),
  new CryptoAdaptiveMomentumStrategy(),
  new CryptoScalpMicroBreakoutStrategy(),
  new CryptoLiquidityImbalanceStrategy(),
  new CryptoDynamicDcaReversalStrategy(),
];

export function getEnabledCryptoStrategies(): Strategy[] {
  return ALL_CRYPTO_STRATEGIES.filter((strategy) => {
    if (strategy.slug === 'crypto_market_regime_grid') return config.crypto.enableGridStrategy;
    if (strategy.slug === 'crypto_btc_market_leader') return config.crypto.enableBtcLeader;
    if (strategy.slug === 'crypto_adaptive_momentum') return config.crypto.enableAdaptiveMomentum;
    if (strategy.slug === 'crypto_scalp_microbreakout') return config.crypto.enableScalpMicrobreakout;
    if (strategy.slug === 'crypto_liquidity_imbalance') return config.crypto.enableLiquidityImbalance;
    if (strategy.slug === 'crypto_dynamic_dca_reversal') return config.crypto.enableDynamicDca;
    return true;
  });
}

export { calculateBtcTrendBias, setBtcContextCandles };
