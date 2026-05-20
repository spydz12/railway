"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwelveDataProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('provider:twelvedata');
const BASE_URL = 'https://api.twelvedata.com';
const INTERVAL_MAP = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1h',
    '4h': '4h',
    '1d': '1day',
};
class TwelveDataProvider {
    constructor() {
        this.name = 'twelvedata';
    }
    isConfigured() {
        return !!config_1.config.marketData.twelveDataApiKey;
    }
    async getCandles(ticker, timeframe, limit = 100) {
        if (!this.isConfigured())
            return [];
        const interval = INTERVAL_MAP[timeframe] ?? '15min';
        try {
            const resp = await axios_1.default.get(`${BASE_URL}/time_series`, {
                params: {
                    symbol: ticker,
                    interval,
                    outputsize: limit,
                    format: 'JSON',
                    apikey: config_1.config.marketData.twelveDataApiKey,
                },
                timeout: 10000,
            });
            const values = resp.data?.values;
            if (!Array.isArray(values))
                return [];
            // Twelve Data returns candles newest-first. Use [...values].reverse() to avoid
            // mutating the original response array (Array.prototype.reverse() mutates in place).
            return [...values].reverse().map((v) => ({
                time: new Date(v.datetime).getTime(),
                open: parseFloat(v.open),
                high: parseFloat(v.high),
                low: parseFloat(v.low),
                close: parseFloat(v.close),
                volume: parseFloat(v.volume ?? '0'),
            }));
        }
        catch (err) {
            log.error('getCandles failed', { ticker, timeframe, err: err.message });
            return [];
        }
    }
    async getQuote(ticker) {
        if (!this.isConfigured())
            return null;
        try {
            const resp = await axios_1.default.get(`${BASE_URL}/price`, {
                params: { symbol: ticker, apikey: config_1.config.marketData.twelveDataApiKey },
                timeout: 8000,
            });
            const price = parseFloat(resp.data?.price);
            if (isNaN(price) || price <= 0)
                return null;
            return {
                ticker,
                price,
                bid: price,
                ask: price,
                volume: 0,
                timestamp: Date.now(),
            };
        }
        catch (err) {
            log.error('getQuote failed', { ticker, err: err.message });
            return null;
        }
    }
    async getMultipleQuotes(tickers) {
        if (!this.isConfigured())
            return new Map();
        try {
            const resp = await axios_1.default.get(`${BASE_URL}/price`, {
                params: {
                    symbol: tickers.join(','),
                    apikey: config_1.config.marketData.twelveDataApiKey,
                },
                timeout: 10000,
            });
            const map = new Map();
            const data = resp.data;
            if (tickers.length === 1) {
                const price = parseFloat(data?.price);
                if (!isNaN(price) && price > 0) {
                    map.set(tickers[0], {
                        ticker: tickers[0],
                        price,
                        bid: price,
                        ask: price,
                        volume: 0,
                        timestamp: Date.now(),
                    });
                }
            }
            else {
                for (const ticker of tickers) {
                    const price = parseFloat(data[ticker]?.price);
                    if (!isNaN(price) && price > 0) {
                        map.set(ticker, {
                            ticker,
                            price,
                            bid: price,
                            ask: price,
                            volume: 0,
                            timestamp: Date.now(),
                        });
                    }
                }
            }
            return map;
        }
        catch (err) {
            log.error('getMultipleQuotes failed', { err: err.message });
            return new Map();
        }
    }
}
exports.TwelveDataProvider = TwelveDataProvider;
