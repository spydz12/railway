"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTelegramBot = getTelegramBot;
exports.sendNewTradeIdea = sendNewTradeIdea;
exports.sendTradeUpdate = sendTradeUpdate;
exports.sendAdminMessage = sendAdminMessage;
exports.testConnection = testConnection;
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const crypto_1 = require("crypto");
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const queries_1 = require("../database/queries");
const formatter_1 = require("./formatter");
const retryQueue_1 = require("../ops/retryQueue");
const metrics_1 = require("../observability/metrics");
const log = (0, logger_1.createComponentLogger)('telegram');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const telegramRetryQueue = new retryQueue_1.RetryQueue('telegram', 1200);
telegramRetryQueue.start();
let _bot = null;
let lastTelegramSendError = null;
function normalizeDirection(direction) {
    return direction?.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';
}
function roundEntry(entry) {
    const value = typeof entry === 'number' ? entry : 0;
    return Number(value.toFixed(2));
}
function getFingerprintTimestamp(idea) {
    const dynamicIdea = idea;
    const candleTimestamp = dynamicIdea.candleTimestamp || dynamicIdea.candle_timestamp;
    const signalTimestamp = dynamicIdea.signalTimestamp || dynamicIdea.signal_timestamp || dynamicIdea.setupTimestamp || dynamicIdea.setup_timestamp;
    const timestamp = candleTimestamp || signalTimestamp || dynamicIdea.created_at;
    return String(timestamp || 'unknown');
}
function buildSignalFingerprint(idea) {
    const direction = normalizeDirection(idea.direction);
    const roundedEntry = roundEntry(idea.entry_price);
    const timestampUsed = getFingerprintTimestamp(idea);
    const fingerprintSource = [
        String(idea.ticker || 'unknown'),
        String(direction || 'unknown'),
        String(idea.strategy_slug || 'unknown'),
        String(idea.timeframe || 'unknown'),
        roundedEntry.toFixed(2),
        timestampUsed,
    ].join('|');
    const fingerprint = (0, crypto_1.createHash)('sha1').update(fingerprintSource).digest('hex');
    return { fingerprint, direction, roundedEntry, timestampUsed };
}
function getSignalIdOrNull(idea) {
    const signalId = typeof idea.id === 'string' ? idea.id : '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(signalId)
        ? signalId
        : null;
}
async function auditSignalEvent(idea, direction, fingerprint, eventType, telegramMessageId, skippedReason, metadata = {}) {
    await (0, queries_1.createSignalAuditEntry)({
        signal_id: getSignalIdOrNull(idea),
        fingerprint,
        ticker: idea.ticker,
        strategy_slug: idea.strategy_slug,
        timeframe: idea.timeframe,
        direction,
        telegram_message_id: telegramMessageId,
        event_type: eventType,
        skipped_reason: skippedReason,
        metadata,
    });
    log.info('[AUDIT_SIGNAL]', {
        ticker: idea.ticker,
        strategy: idea.strategy_slug,
        fingerprint,
        eventType,
        telegramMessageId,
        skippedReason,
    });
}
function getTelegramBot() {
    if (!_bot) {
        _bot = new node_telegram_bot_api_1.default(config_1.config.telegram.botToken, { polling: false });
    }
    return _bot;
}
async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function sendToChannel(channelId, text, options = {}) {
    const bot = getTelegramBot();
    lastTelegramSendError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const msg = await bot.sendMessage(channelId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...options,
            });
            lastTelegramSendError = null;
            return msg.message_id;
        }
        catch (err) {
            const errMsg = err.message ?? '';
            lastTelegramSendError = errMsg || 'Unknown Telegram error';
            const isTelegramRateLimit = errMsg.includes('429') || errMsg.toLowerCase().includes('too many requests');
            if (attempt < MAX_RETRIES) {
                const delay = RETRY_DELAY_MS * (isTelegramRateLimit ? 5 : attempt);
                log.warn(`Telegram send failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms`, {
                    channelId,
                    err: errMsg,
                });
                await sleep(delay);
            }
            else {
                log.error('Telegram send failed after all retries', {
                    channelId,
                    err: errMsg,
                });
                const jobId = `${channelId}-${Date.now()}`;
                telegramRetryQueue.enqueue({
                    id: jobId,
                    maxAttempts: 4,
                    run: async () => {
                        const bot = getTelegramBot();
                        await bot.sendMessage(channelId, text, {
                            parse_mode: 'HTML',
                            disable_web_page_preview: true,
                            ...options,
                        });
                    },
                });
                return null;
            }
        }
    }
    return null;
}
async function sendNewTradeIdea(idea) {
    const { fingerprint, direction, roundedEntry, timestampUsed } = buildSignalFingerprint(idea);
    const isWatchOnly = String(idea.status || '').toLowerCase() === 'watch';
    log.info('[FINGERPRINT_BUILD]', {
        ticker: idea.ticker,
        strategy: idea.strategy_slug,
        roundedEntry,
        timestampUsed,
        fingerprint,
    });
    const duplicate = await (0, queries_1.hasRecentSignalFingerprint)(fingerprint);
    if (duplicate) {
        (0, metrics_1.incrementCounter)('duplicateSignalsPrevented');
        await auditSignalEvent(idea, direction, fingerprint, 'DUPLICATE_SKIPPED', null, 'TTL cache fingerprint match', {
            roundedEntry,
            timestampUsed,
        });
        log.info('[DUPLICATE_SIGNAL_SKIPPED]', {
            symbol: idea.ticker,
            direction,
            strategy: idea.strategy_slug,
            timeframe: idea.timeframe,
            roundedEntry,
            fingerprint,
            ttlSeconds: 3600,
        });
        return null;
    }
    const text = (0, formatter_1.formatNewIdeaMessage)(idea);
    const messageId = await sendToChannel(config_1.config.telegram.channelId, text);
    if (messageId) {
        await (0, queries_1.upsertSignalFingerprintCache)(fingerprint, {
            symbol: idea.ticker,
            direction,
            strategy_slug: idea.strategy_slug,
            timeframe: idea.timeframe,
            rounded_entry: roundedEntry,
        }, 3600);
        (0, metrics_1.incrementCounter)('uniqueSignalsSent');
        await auditSignalEvent(idea, direction, fingerprint, isWatchOnly ? 'WATCH_ONLY' : 'SENT', messageId, null, {
            roundedEntry,
            timestampUsed,
        });
        log.info(`Sent trade idea: ${idea.ticker} (msg id: ${messageId})`);
    }
    else {
        await auditSignalEvent(idea, direction, fingerprint, 'FAILED', null, lastTelegramSendError || 'Telegram send failed after retries', {
            roundedEntry,
            timestampUsed,
        });
        log.error(`Failed to send trade idea for ${idea.ticker} after retries`);
    }
    // Multilingual channels (optional — only if configured)
    if (config_1.config.telegram.channelIdFr) {
        await sendToChannel(config_1.config.telegram.channelIdFr, text);
    }
    if (config_1.config.telegram.channelIdAr) {
        await sendToChannel(config_1.config.telegram.channelIdAr, text);
    }
    return messageId;
}
async function sendTradeUpdate(idea, event, price) {
    const text = (0, formatter_1.formatUpdateMessage)(idea, event, price);
    const messageId = await sendToChannel(config_1.config.telegram.channelId, text);
    if (messageId) {
        log.info(`Sent trade update: ${idea.ticker} — ${event} @ $${price}`);
    }
    else {
        log.error(`Failed to send update for ${idea.ticker} (${event}) after retries`);
    }
}
async function sendAdminMessage(text) {
    await sendToChannel(config_1.config.telegram.channelId, text);
}
async function testConnection() {
    try {
        const bot = getTelegramBot();
        const me = await bot.getMe();
        log.info(`Telegram bot connected: @${me.username}`);
        return true;
    }
    catch (err) {
        log.error('Telegram connection test failed', { err: err.message });
        return false;
    }
}
