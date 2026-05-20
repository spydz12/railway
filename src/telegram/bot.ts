import TelegramBot from 'node-telegram-bot-api';
import { createHash } from 'crypto';
import { config } from '../config';
import { createComponentLogger } from '../utils/logger';
import { TradeIdea, SignalAuditEventType, createSignalAuditEntry, hasRecentSignalFingerprint, upsertSignalFingerprintCache } from '../database/queries';
import { TrackingEvent } from '../tracking/monitor';
import { formatNewIdeaMessage, formatUpdateMessage } from './formatter';
import { RetryQueue } from '../ops/retryQueue';
import { incrementCounter } from '../observability/metrics';

const log = createComponentLogger('telegram');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const telegramRetryQueue = new RetryQueue('telegram', 1200);
telegramRetryQueue.start();

let _bot: TelegramBot | null = null;
let lastTelegramSendError: string | null = null;

function normalizeDirection(direction: string | undefined): 'LONG' | 'SHORT' {
  return direction?.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';
}

function roundEntry(entry: number | null): number {
  const value = typeof entry === 'number' ? entry : 0;
  return Number(value.toFixed(2));
}

function getFingerprintTimestamp(idea: TradeIdea): string {
  const dynamicIdea = idea as TradeIdea & {
    candleTimestamp?: string | number | null;
    candle_timestamp?: string | number | null;
    signalTimestamp?: string | number | null;
    signal_timestamp?: string | number | null;
    setupTimestamp?: string | number | null;
    setup_timestamp?: string | number | null;
  };

  const candleTimestamp = dynamicIdea.candleTimestamp || dynamicIdea.candle_timestamp;
  const signalTimestamp = dynamicIdea.signalTimestamp || dynamicIdea.signal_timestamp || dynamicIdea.setupTimestamp || dynamicIdea.setup_timestamp;
  const timestamp = candleTimestamp || signalTimestamp || dynamicIdea.created_at;
  return String(timestamp || 'unknown');
}

function buildSignalFingerprint(idea: TradeIdea): { fingerprint: string; direction: 'LONG' | 'SHORT'; roundedEntry: number; timestampUsed: string } {
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
  const fingerprint = createHash('sha1').update(fingerprintSource).digest('hex');
  return { fingerprint, direction, roundedEntry, timestampUsed };
}

function getSignalIdOrNull(idea: TradeIdea): string | null {
  const signalId = typeof idea.id === 'string' ? idea.id : '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(signalId)
    ? signalId
    : null;
}

async function auditSignalEvent(
  idea: TradeIdea,
  direction: 'LONG' | 'SHORT',
  fingerprint: string,
  eventType: SignalAuditEventType,
  telegramMessageId: number | null,
  skippedReason: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await createSignalAuditEntry({
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

export function getTelegramBot(): TelegramBot {
  if (!_bot) {
    _bot = new TelegramBot(config.telegram.botToken, { polling: false });
  }
  return _bot;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToChannel(
  channelId: string,
  text: string,
  options: TelegramBot.SendMessageOptions = {}
): Promise<number | null> {
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
    } catch (err: unknown) {
      const errMsg = (err as Error).message ?? '';
      lastTelegramSendError = errMsg || 'Unknown Telegram error';
      const isTelegramRateLimit = errMsg.includes('429') || errMsg.toLowerCase().includes('too many requests');

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * (isTelegramRateLimit ? 5 : attempt);
        log.warn(`Telegram send failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms`, {
          channelId,
          err: errMsg,
        });
        await sleep(delay);
      } else {
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

export async function sendNewTradeIdea(idea: TradeIdea): Promise<number | null> {
  const { fingerprint, direction, roundedEntry, timestampUsed } = buildSignalFingerprint(idea);
  const isWatchOnly = String(idea.status || '').toLowerCase() === 'watch';
  log.info('[FINGERPRINT_BUILD]', {
    ticker: idea.ticker,
    strategy: idea.strategy_slug,
    roundedEntry,
    timestampUsed,
    fingerprint,
  });
  const duplicate = await hasRecentSignalFingerprint(fingerprint);
  if (duplicate) {
    incrementCounter('duplicateSignalsPrevented');
    await auditSignalEvent(
      idea,
      direction,
      fingerprint,
      'DUPLICATE_SKIPPED',
      null,
      'TTL cache fingerprint match',
      {
        roundedEntry,
        timestampUsed,
      }
    );
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

  const text = formatNewIdeaMessage(idea);
  const messageId = await sendToChannel(config.telegram.channelId, text);
  if (messageId) {
    await upsertSignalFingerprintCache(
      fingerprint,
      {
        symbol: idea.ticker,
        direction,
        strategy_slug: idea.strategy_slug,
        timeframe: idea.timeframe,
        rounded_entry: roundedEntry,
      },
      3600
    );
    incrementCounter('uniqueSignalsSent');
    await auditSignalEvent(
      idea,
      direction,
      fingerprint,
      isWatchOnly ? 'WATCH_ONLY' : 'SENT',
      messageId,
      null,
      {
        roundedEntry,
        timestampUsed,
      }
    );
    log.info(`Sent trade idea: ${idea.ticker} (msg id: ${messageId})`);
  } else {
    await auditSignalEvent(
      idea,
      direction,
      fingerprint,
      'FAILED',
      null,
      lastTelegramSendError || 'Telegram send failed after retries',
      {
        roundedEntry,
        timestampUsed,
      }
    );
    log.error(`Failed to send trade idea for ${idea.ticker} after retries`);
  }

  // Multilingual channels (optional — only if configured)
  if (config.telegram.channelIdFr) {
    await sendToChannel(config.telegram.channelIdFr, text);
  }
  if (config.telegram.channelIdAr) {
    await sendToChannel(config.telegram.channelIdAr, text);
  }

  return messageId;
}

export async function sendTradeUpdate(
  idea: TradeIdea,
  event: TrackingEvent,
  price: number
): Promise<void> {
  const text = formatUpdateMessage(idea, event, price);
  const messageId = await sendToChannel(config.telegram.channelId, text);
  if (messageId) {
    log.info(`Sent trade update: ${idea.ticker} — ${event} @ $${price}`);
  } else {
    log.error(`Failed to send update for ${idea.ticker} (${event}) after retries`);
  }
}

export async function sendAdminMessage(text: string): Promise<void> {
  await sendToChannel(config.telegram.channelId, text);
}

export async function testConnection(): Promise<boolean> {
  try {
    const bot = getTelegramBot();
    const me = await bot.getMe();
    log.info(`Telegram bot connected: @${me.username}`);
    return true;
  } catch (err: unknown) {
    log.error('Telegram connection test failed', { err: (err as Error).message });
    return false;
  }
}
