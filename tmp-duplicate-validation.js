const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

(async () => {
  const { getDbClient } = require('./dist/database/client');
  const { hasRecentSignalFingerprint } = require('./dist/database/queries');
  const { sendNewTradeIdea } = require('./dist/telegram/bot');

  const idea = {
    id: '00000000-0000-0000-0000-000000000001',
    ticker: 'SOLUSDT',
    company_name: 'SOLUSDT',
    direction: 'LONG',
    strategy_slug: 'crypto_adaptive_momentum',
    timeframe: '15m',
    entry_price: 175.1234,
    entry_zone_low: 174.8,
    entry_zone_high: 175.4,
    stop_loss: 170,
    take_profit_1: 182,
    take_profit_2: 188,
    take_profit_3: null,
    trailing_rule: '',
    invalidation_rule: '',
    confidence_score: 72,
    risk_reward_ratio: 2.1,
    reason: 'validation-run',
    reasons: ['validation-run'],
    volume_confirmation: true,
    market_type: 'crypto',
    exchange: 'binance',
    crypto_metadata: null,
    market_condition: 'bullish',
    total_score: 72,
    signal_quality: 'HIGH_QUALITY',
    rejection_reasons: [],
    status: 'pending',
    provider_used: 'binance',
    telegram_message_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    closed_at: null,
    exit_reason: '',
  };

  const roundedEntry = Number((idea.entry_price ?? 0).toFixed(2));
  const fingerprintSource = [idea.ticker, 'LONG', idea.strategy_slug, idea.timeframe, roundedEntry.toFixed(2)].join('|');
  const fingerprint1 = createHash('sha1').update(fingerprintSource).digest('hex');
  const fingerprint2 = createHash('sha1').update(fingerprintSource).digest('hex');

  const db = getDbClient();

  const existsProbe = await db.from('signal_delivery_cache').select('fingerprint', { count: 'exact', head: true }).limit(1);
  if (existsProbe.error) {
    console.log(JSON.stringify({
      gracefulFailure: true,
      reason: 'signal_delivery_cache table missing or inaccessible',
      error: existsProbe.error.message,
      firstFingerprint: fingerprint1,
      secondFingerprint: fingerprint2
    }, null, 2));
    process.exit(0);
  }

  await db.from('signal_delivery_cache').delete().eq('fingerprint', fingerprint1);

  const firstMessageId = await sendNewTradeIdea(idea);
  const cacheLookupAfterFirst = await hasRecentSignalFingerprint(fingerprint1);

  const rowRes = await db
    .from('signal_delivery_cache')
    .select('created_at, expires_at, fingerprint')
    .eq('fingerprint', fingerprint1)
    .maybeSingle();

  let ttlSecondsStored = null;
  if (rowRes.data?.created_at && rowRes.data?.expires_at) {
    const created = new Date(rowRes.data.created_at).getTime();
    const expires = new Date(rowRes.data.expires_at).getTime();
    ttlSecondsStored = Math.round((expires - created) / 1000);
  }

  const secondMessageId = await sendNewTradeIdea(idea);
  const cacheLookupAfterSecond = await hasRecentSignalFingerprint(fingerprint2);

  const combinedLogPath = path.join(process.cwd(), 'logs', 'combined.log');
  let duplicateLogSeen = false;
  if (fs.existsSync(combinedLogPath)) {
    const tail = fs.readFileSync(combinedLogPath, 'utf8').split('\n').slice(-400).join('\n');
    duplicateLogSeen = tail.includes('[DUPLICATE_SIGNAL_SKIPPED]') && tail.includes(fingerprint1);
  }

  const duplicateSkipped = secondMessageId === null && cacheLookupAfterSecond;

  console.log(JSON.stringify({
    gracefulFailure: false,
    firstFingerprint: fingerprint1,
    secondFingerprint: fingerprint2,
    firstSendMessageId: firstMessageId,
    secondSendMessageId: secondMessageId,
    cacheLookupResultAfterFirst: cacheLookupAfterFirst,
    cacheLookupResultAfterSecond: cacheLookupAfterSecond,
    duplicateSkipped,
    duplicateLogSeen,
    ttlSecondsStored,
    ttlExpected: 3600,
    ttlMatchesExpected: ttlSecondsStored === 3600
  }, null, 2));
})();
