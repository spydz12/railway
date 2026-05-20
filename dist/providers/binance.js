"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('provider:binance');
const BASE_URL = 'https://api.binance.com';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
function parseTimeframe(tf) {
    // Binance supports common intervals like 1m, 3m, 5m, 15m, 30m, 1h, 4h, 1d
    return tf;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
class BinanceProvider {
    constructor() {
        this.name = 'binance';
        this.client = axios_1.default.create({
            baseURL: BASE_URL,
            timeout: DEFAULT_TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    isConfigured() {
        return true;
    }
    async request(path, params = {}) {
        let attempt = 0;
        while (attempt < MAX_RETRIES) {
            try {
                const response = await this.client.get(path, { params });
                return response.data;
            }
            catch (error) {
                attempt += 1;
                const message = error instanceof Error ? error.message : String(error);
                log.warn('Binance request failed', { path, params, attempt, message });
                if (attempt >= MAX_RETRIES) {
                    throw error;
                }
                await sleep(500 * attempt);
            }
        }
        throw new Error('Binance request failed after retries');
    }
    async getCandles(ticker, timeframe, limit) {
        const interval = parseTimeframe(timeframe);
        const params = {
            symbol: ticker,
            interval,
            limit: Math.min(limit, 1000),
        };
        const data = await this.request('/api/v3/klines', params);
        // Drop the last entry which is the currently open (incomplete) candle.
        // Using it would show artificially low volume compared to fully closed candles.
        // Binance kline array indexes: [0]=openTime [1]=open [2]=high [3]=low [4]=close
        // [5]=baseAssetVolume [6]=closeTime [7]=quoteAssetVolume
        // We use index 5 (base asset volume) for relative volume comparisons.
        const closedCandles = data.length > 1 ? data.slice(0, -1) : data;
        return closedCandles.map((row) => ({
            time: Number(row[0]),
            open: Number(row[1]),
            high: Number(row[2]),
            low: Number(row[3]),
            close: Number(row[4]),
            volume: Number(row[5]),
        }));
    }
    async getQuote(ticker) {
        try {
            const data = await this.request('/api/v3/ticker/price', { symbol: ticker });
            const price = Number(data.price);
            return {
                ticker,
                price,
                bid: price,
                ask: price,
                volume: 0,
                timestamp: Date.now(),
            };
        }
        catch (error) {
            log.error('Failed to fetch Binance quote', { ticker, error: error instanceof Error ? error.message : String(error) });
            return null;
        }
    }
    async getMultipleQuotes(tickers) {
        const results = new Map();
        const requests = tickers.map(async (ticker) => {
            const quote = await this.getQuote(ticker);
            if (quote) {
                results.set(ticker, quote);
            }
        });
        await Promise.all(requests);
        return results;
    }
}
exports.BinanceProvider = BinanceProvider;
