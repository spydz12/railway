"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setBtcContextCandles = exports.calculateBtcTrendBias = void 0;
exports.getEnabledCryptoStrategies = getEnabledCryptoStrategies;
const momentumBreakout_1 = require("./momentumBreakout");
const vwapReclaim_1 = require("./vwapReclaim");
const emaTrendCloud_1 = require("./emaTrendCloud");
const liquiditySweepReversal_1 = require("./liquiditySweepReversal");
const rsiBollingerReversion_1 = require("./rsiBollingerReversion");
const crypto_market_regime_grid_1 = require("./crypto_market_regime_grid");
const crypto_btc_market_leader_1 = require("./crypto_btc_market_leader");
const crypto_adaptive_momentum_1 = require("./crypto_adaptive_momentum");
const crypto_scalp_microbreakout_1 = require("./crypto_scalp_microbreakout");
const crypto_liquidity_imbalance_1 = require("./crypto_liquidity_imbalance");
const crypto_dynamic_dca_reversal_1 = require("./crypto_dynamic_dca_reversal");
const btcLeaderFilter_1 = require("./btcLeaderFilter");
Object.defineProperty(exports, "calculateBtcTrendBias", { enumerable: true, get: function () { return btcLeaderFilter_1.calculateBtcTrendBias; } });
const crypto_btc_market_leader_2 = require("./crypto_btc_market_leader");
Object.defineProperty(exports, "setBtcContextCandles", { enumerable: true, get: function () { return crypto_btc_market_leader_2.setBtcContextCandles; } });
const config_1 = require("../../config");
const ALL_CRYPTO_STRATEGIES = [
    new momentumBreakout_1.CryptoMomentumBreakoutStrategy(),
    new vwapReclaim_1.CryptoVWAPReclaimStrategy(),
    new emaTrendCloud_1.CryptoEMATrendCloudStrategy(),
    new liquiditySweepReversal_1.CryptoLiquiditySweepReversalStrategy(),
    new rsiBollingerReversion_1.CryptoRSIBollingerReversionStrategy(),
    new crypto_market_regime_grid_1.CryptoMarketRegimeGridStrategy(),
    new crypto_btc_market_leader_1.CryptoBtcMarketLeaderStrategy(),
    new crypto_adaptive_momentum_1.CryptoAdaptiveMomentumStrategy(),
    new crypto_scalp_microbreakout_1.CryptoScalpMicroBreakoutStrategy(),
    new crypto_liquidity_imbalance_1.CryptoLiquidityImbalanceStrategy(),
    new crypto_dynamic_dca_reversal_1.CryptoDynamicDcaReversalStrategy(),
];
function getEnabledCryptoStrategies() {
    return ALL_CRYPTO_STRATEGIES.filter((strategy) => {
        if (strategy.slug === 'crypto_market_regime_grid')
            return config_1.config.crypto.enableGridStrategy;
        if (strategy.slug === 'crypto_btc_market_leader')
            return config_1.config.crypto.enableBtcLeader;
        if (strategy.slug === 'crypto_adaptive_momentum')
            return config_1.config.crypto.enableAdaptiveMomentum;
        if (strategy.slug === 'crypto_scalp_microbreakout')
            return config_1.config.crypto.enableScalpMicrobreakout;
        if (strategy.slug === 'crypto_liquidity_imbalance')
            return config_1.config.crypto.enableLiquidityImbalance;
        if (strategy.slug === 'crypto_dynamic_dca_reversal')
            return config_1.config.crypto.enableDynamicDca;
        return true;
    });
}
