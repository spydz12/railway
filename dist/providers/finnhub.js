"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinnhubProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('provider:finnhub');
const BASE_URL = 'https://finnhub.io/api/v1';
const RESOLUTION_MAP = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': 'D',
    '1d': 'D',
};
class FinnhubProvider {
    constructor() {
        this.name = 'finnhub';
    }
    isConfigured() {
        return !!config_1.config.marketData.finnhubApiKey;
    }
    async getCandles(ticker, timeframe, limit = 100) {
        if (!this.isConfigured())
            return [];
        const resolution = RESOLUTION_MAP[timeframe] ?? '15';
        const to = Math.floor(Date.now() / 1000);
        const msPerCandle = this.resolutionToMs(resolution);
        const from = Math.floor((Date.now() - limit * msPerCandle * 1.5) / 1000);
        try {
            const resp = await axios_1.default.get(`${BASE_URL}/stock/candle`, {
                params: {
                    symbol: ticker,
                    resolution,
                    from,
                    to,
                    token: config_1.config.marketData.finnhubApiKey,
                },
                timeout: 10000,
            });
            const data = resp.data;
            if (data.s !== 'ok' || !data.c)
                return [];
            return data.c.map((_, i) => ({
                time: data.t[i] * 1000,
                open: data.o[i],
                high: data.h[i],
                low: data.l[i],
                close: data.c[i],
                volume: data.v[i],
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
            const resp = await axios_1.default.get(`${BASE_URL}/quote`, {
                params: { symbol: ticker, token: config_1.config.marketData.finnhubApiKey },
                timeout: 8000,
            });
            const q = resp.data;
            if (!q || !q.c)
                return null;
            return {
                ticker,
                price: q.c,
                bid: q.c,
                ask: q.c,
                volume: q.v ?? 0,
                timestamp: Date.now(),
            };
        }
        catch (err) {
            log.error('getQuote failed', { ticker, err: err.message });
            return null;
        }
    }
    async getMultipleQuotes(tickers) {
        const map = new Map();
        for (const ticker of tickers) {
            const q = await this.getQuote(ticker);
            if (q)
                map.set(ticker, q);
            await new Promise((r) => setTimeout(r, 100));
        }
        return map;
    }
    resolutionToMs(resolution) {
        const map = {
            '1': 60000, '5': 300000, '15': 900000,
            '30': 1800000, '60': 3600000, 'D': 86400000,
        };
        return map[resolution] ?? 900000;
    }
}
exports.FinnhubProvider = FinnhubProvider;
