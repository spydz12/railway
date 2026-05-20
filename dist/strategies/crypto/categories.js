"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEAN_REVERSION_STRATEGIES = exports.TREND_STRATEGIES = void 0;
exports.getCryptoStrategyCategory = getCryptoStrategyCategory;
exports.TREND_STRATEGIES = [
    'crypto_momentum_breakout',
    'crypto_ema_trend_cloud',
    'crypto_vwap_reclaim',
    'crypto_btc_market_leader',
    'crypto_adaptive_momentum',
    'crypto_scalp_microbreakout',
];
exports.MEAN_REVERSION_STRATEGIES = [
    'crypto_rsi_bollinger_reversion',
    'crypto_liquidity_sweep_reversal',
    'crypto_market_regime_grid',
    'crypto_liquidity_imbalance',
    'crypto_dynamic_dca_reversal',
];
function getCryptoStrategyCategory(strategy) {
    if (exports.TREND_STRATEGIES.includes(strategy)) {
        return 'TREND';
    }
    if (exports.MEAN_REVERSION_STRATEGIES.includes(strategy)) {
        return 'MEAN_REVERSION';
    }
    return 'OTHER';
}
