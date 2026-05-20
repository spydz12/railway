"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlpacaProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createComponentLogger)('provider:alpaca');
const DATA_URL = 'https://data.alpaca.markets/v2';
const PAPER_HEADERS = () => ({
    'APCA-API-KEY-ID': config_1.config.marketData.alpacaApiKey,
    'APCA-API-SECRET-KEY': config_1.config.marketData.alpacaApiSecret,
});
const TIMEFRAME_MAP = {
    '1m': '1Min',
    '5m': '5Min',
    '15m': '15Min',
    '30m': '30Min',
    '1h': '1Hour',
    '4h': '4Hour',
    '1d': '1Day',
};
class AlpacaProvider {
    constructor() {
        this.name = 'alpaca';
    }
    isConfigured() {
        return !!(config_1.config.marketData.alpacaApiKey && config_1.config.marketData.alpacaApiSecret);
    }
    async getCandles(ticker, timeframe, limit = 100) {
        if (!this.isConfigured())
            return [];
        const tf = TIMEFRAME_MAP[timeframe] ?? '15Min';
        try {
            const resp = await axios_1.default.get(`${DATA_URL}/stocks/${ticker}/bars`, {
                headers: PAPER_HEADERS(),
                params: {
                    timeframe: tf,
                    limit,
                    adjustment: 'raw',
                    feed: 'sip',
                },
                timeout: 10000,
            });
            const bars = resp.data?.bars ?? [];
            return bars.map((b) => ({
                time: new Date(b.t).getTime(),
                open: b.o,
                high: b.h,
                low: b.l,
                close: b.c,
                volume: b.v,
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
            const resp = await axios_1.default.get(`${DATA_URL}/stocks/${ticker}/quotes/latest`, {
                headers: PAPER_HEADERS(),
                params: { feed: 'sip' },
                timeout: 8000,
            });
            const q = resp.data?.quote;
            if (!q)
                return null;
            const mid = (q.ap + q.bp) / 2;
            return {
                ticker,
                price: mid,
                bid: q.bp,
                ask: q.ap,
                volume: 0,
                timestamp: new Date(q.t).getTime(),
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
            const resp = await axios_1.default.get(`${DATA_URL}/stocks/quotes/latest`, {
                headers: PAPER_HEADERS(),
                params: { symbols: tickers.join(','), feed: 'sip' },
                timeout: 10000,
            });
            const quotes = resp.data?.quotes ?? {};
            const map = new Map();
            for (const [ticker, q] of Object.entries(quotes)) {
                map.set(ticker, {
                    ticker,
                    price: (q.ap + q.bp) / 2,
                    bid: q.bp,
                    ask: q.ap,
                    volume: 0,
                    timestamp: new Date(q.t).getTime(),
                });
            }
            return map;
        }
        catch (err) {
            log.error('getMultipleQuotes failed', { err: err.message });
            return new Map();
        }
    }
}
exports.AlpacaProvider = AlpacaProvider;
