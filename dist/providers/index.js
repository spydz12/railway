"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProvider = getProvider;
exports.getCryptoProvider = getCryptoProvider;
exports.getProviderStatus = getProviderStatus;
exports.getQuoteWithFailover = getQuoteWithFailover;
exports.getCandlesWithFailover = getCandlesWithFailover;
const polygon_1 = require("./polygon");
const alpaca_1 = require("./alpaca");
const finnhub_1 = require("./finnhub");
const twelvedata_1 = require("./twelvedata");
const binance_1 = require("./binance");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('providers');
const STOCK_PROVIDERS = [
    new polygon_1.PolygonProvider(),
    new alpaca_1.AlpacaProvider(),
    new finnhub_1.FinnhubProvider(),
    new twelvedata_1.TwelveDataProvider(),
];
const CRYPTO_PROVIDERS = [
    new binance_1.BinanceProvider(),
];
let _activeStockProvider = null;
let _activeCryptoProvider = null;
function getProvider() {
    if (_activeStockProvider)
        return _activeStockProvider;
    const preferred = config_1.config.marketData.provider.toLowerCase();
    const preferredProvider = STOCK_PROVIDERS.find((p) => p.name === preferred && p.isConfigured());
    if (preferredProvider) {
        log.info(`Using preferred stock market data provider: ${preferredProvider.name}`);
        _activeStockProvider = preferredProvider;
        return _activeStockProvider;
    }
    const fallback = STOCK_PROVIDERS.find((p) => p.isConfigured());
    if (fallback) {
        log.warn(`Preferred stock provider "${preferred}" not configured. Falling back to: ${fallback.name}`);
        _activeStockProvider = fallback;
        return _activeStockProvider;
    }
    throw new Error('No stock market data provider is configured. Please set at least one API key (POLYGON_API_KEY, ALPACA_API_KEY, FINNHUB_API_KEY, or TWELVE_DATA_API_KEY).');
}
function getCryptoProvider() {
    if (_activeCryptoProvider)
        return _activeCryptoProvider;
    if (!config_1.config.crypto.enabled) {
        throw new Error('Crypto provider requested but ENABLE_CRYPTO is disabled');
    }
    const preferred = config_1.config.crypto.provider.toLowerCase();
    const preferredProvider = CRYPTO_PROVIDERS.find((p) => p.name === preferred && p.isConfigured());
    if (preferredProvider) {
        log.info(`Using crypto market data provider: ${preferredProvider.name}`);
        _activeCryptoProvider = preferredProvider;
        return _activeCryptoProvider;
    }
    const fallback = CRYPTO_PROVIDERS.find((p) => p.isConfigured());
    if (fallback) {
        log.warn(`Preferred crypto provider "${preferred}" not configured. Falling back to: ${fallback.name}`);
        _activeCryptoProvider = fallback;
        return _activeCryptoProvider;
    }
    throw new Error('No crypto market data provider is configured. Please set CRYPTO_PROVIDER=binance.');
}
function getProviderStatus() {
    return [
        ...STOCK_PROVIDERS.map((p) => ({ name: p.name, configured: p.isConfigured() })),
        ...CRYPTO_PROVIDERS.map((p) => ({ name: p.name, configured: p.isConfigured() })),
    ];
}
async function getQuoteWithFailover(ticker, marketType = 'stocks') {
    const providers = marketType === 'crypto' ? CRYPTO_PROVIDERS : STOCK_PROVIDERS;
    const configured = providers.filter((p) => p.isConfigured());
    for (const provider of configured) {
        try {
            const quote = await provider.getQuote(ticker);
            if (quote && quote.price > 0) {
                if ((marketType === 'stocks' ? _activeStockProvider : _activeCryptoProvider)?.name !== provider.name) {
                    log.warn(`Provider failover activated for ${ticker}: ${provider.name}`);
                    if (marketType === 'stocks') {
                        _activeStockProvider = provider;
                    }
                    else {
                        _activeCryptoProvider = provider;
                    }
                }
                return quote;
            }
        }
        catch (error) {
            log.warn('Provider quote failed, trying fallback', {
                provider: provider.name,
                ticker,
                err: error.message,
            });
        }
    }
    return null;
}
async function getCandlesWithFailover(ticker, timeframe, limit, marketType = 'stocks') {
    const providers = marketType === 'crypto' ? CRYPTO_PROVIDERS : STOCK_PROVIDERS;
    const configured = providers.filter((p) => p.isConfigured());
    for (const provider of configured) {
        try {
            const candles = await provider.getCandles(ticker, timeframe, limit);
            if (candles.length > 0) {
                if ((marketType === 'stocks' ? _activeStockProvider : _activeCryptoProvider)?.name !== provider.name) {
                    log.warn(`Provider failover activated for candles ${ticker}: ${provider.name}`);
                    if (marketType === 'stocks') {
                        _activeStockProvider = provider;
                    }
                    else {
                        _activeCryptoProvider = provider;
                    }
                }
                return candles;
            }
        }
        catch (error) {
            log.warn('Provider candles failed, trying fallback', {
                provider: provider.name,
                ticker,
                timeframe,
                err: error.message,
            });
        }
    }
    return [];
}
