"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolygonProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('provider:polygon');
const BASE_URL = 'https://api.polygon.io';
const POLYGON_REQUEST_INTERVAL_MS = parseInt(process.env.POLYGON_REQUEST_INTERVAL_MS || '1500', 10);
const CANDLE_CACHE_TTL_MS = 2 * 60 * 1000;
const TIMEFRAME_MAP = {
    '1m': { multiplier: 1, timespan: 'minute' },
    '5m': { multiplier: 5, timespan: 'minute' },
    '15m': { multiplier: 15, timespan: 'minute' },
    '30m': { multiplier: 30, timespan: 'minute' },
    '1h': { multiplier: 1, timespan: 'hour' },
    '4h': { multiplier: 4, timespan: 'hour' },
    '1d': { multiplier: 1, timespan: 'day' },
};
class RateLimitedQueue {
    constructor(minIntervalMs) {
        this.minIntervalMs = minIntervalMs;
        this.queue = [];
        this.lastExecution = 0;
        this.running = false;
    }
    schedule(task) {
        return new Promise((resolve, reject) => {
            const runTask = async () => {
                try {
                    const result = await task();
                    resolve(result);
                }
                catch (err) {
                    reject(err);
                }
                finally {
                    this.queue.shift();
                    this.next();
                }
            };
            this.queue.push(runTask);
            if (!this.running) {
                this.running = true;
                this.next();
            }
        });
    }
    next() {
        const nextTask = this.queue[0];
        if (!nextTask) {
            this.running = false;
            return;
        }
        const elapsed = Date.now() - this.lastExecution;
        const wait = Math.max(0, this.minIntervalMs - elapsed);
        if (wait > 0) {
            setTimeout(() => {
                this.lastExecution = Date.now();
                nextTask();
            }, wait);
        }
        else {
            this.lastExecution = Date.now();
            nextTask();
        }
    }
}
const polygonRequestQueue = new RateLimitedQueue(POLYGON_REQUEST_INTERVAL_MS);
const candleCache = new Map();
class PolygonProvider {
    constructor() {
        this.name = 'polygon';
    }
    isConfigured() {
        return !!config_1.config.marketData.polygonApiKey;
    }
    createCacheKey(ticker, timeframe, limit) {
        return `${ticker}:${timeframe}:${limit}`.toLowerCase();
    }
    async request(task) {
        return polygonRequestQueue.schedule(task);
    }
    async fetchCandles(ticker, timeframe, limit) {
        const tf = TIMEFRAME_MAP[timeframe] ?? TIMEFRAME_MAP['15m'];
        const to = new Date();
        const from = new Date(to.getTime() - limit * this.tfToMs(tf) * 1.5);
        const fromStr = from.toISOString().split('T')[0];
        const toStr = to.toISOString().split('T')[0];
        const makeRequest = async () => axios_1.default.get(`${BASE_URL}/v2/aggs/ticker/${ticker}/range/${tf.multiplier}/${tf.timespan}/${fromStr}/${toStr}`, {
            params: { adjusted: true, sort: 'asc', limit, apiKey: config_1.config.marketData.polygonApiKey },
            timeout: 30000,
        });
        try {
            const resp = await this.request(makeRequest);
            const results = resp.data?.results ?? [];
            return results.map((r) => ({
                time: r.t,
                open: r.o,
                high: r.h,
                low: r.l,
                close: r.c,
                volume: r.v,
            }));
        }
        catch (err) {
            const error = err;
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                log.warn('Polygon request timed out, retrying once after delay', { ticker, timeframe });
                await new Promise((resolve) => setTimeout(resolve, 5000));
                try {
                    const resp = await this.request(makeRequest);
                    const results = resp.data?.results ?? [];
                    return results.map((r) => ({
                        time: r.t,
                        open: r.o,
                        high: r.h,
                        low: r.l,
                        close: r.c,
                        volume: r.v,
                    }));
                }
                catch (retryErr) {
                    log.error('getCandles failed after retry', { ticker, timeframe, err: retryErr.message });
                    return [];
                }
            }
            throw err;
        }
    }
    async getCandles(ticker, timeframe, limit = 100) {
        if (!this.isConfigured())
            return [];
        const cacheKey = this.createCacheKey(ticker, timeframe, limit);
        const cached = candleCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            log.info(`[provider:polygon] candles fetched ${ticker} ${timeframe} (cache)`);
            return [...cached.candles];
        }
        try {
            const candles = await this.fetchCandles(ticker, timeframe, limit);
            candleCache.set(cacheKey, { candles, expiresAt: Date.now() + CANDLE_CACHE_TTL_MS });
            log.info(`[provider:polygon] candles fetched ${ticker} ${timeframe}`);
            return candles;
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
            const resp = await this.request(() => axios_1.default.get(`${BASE_URL}/v2/last/trade/${ticker}`, {
                params: { apiKey: config_1.config.marketData.polygonApiKey },
                timeout: 8000,
            }));
            const result = resp.data?.results;
            if (!result)
                return null;
            return {
                ticker,
                price: result.p,
                bid: result.p,
                ask: result.p,
                volume: result.s ?? 0,
                timestamp: result.t,
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
            const quote = await this.getQuote(ticker);
            if (quote)
                map.set(ticker, quote);
        }
        return map;
    }
    tfToMs(tf) {
        const base = {
            minute: 60000,
            hour: 3600000,
            day: 86400000,
        };
        return tf.multiplier * (base[tf.timespan] ?? 60000);
    }
}
exports.PolygonProvider = PolygonProvider;
