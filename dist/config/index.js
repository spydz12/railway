"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateRuntimeEnvironment = validateRuntimeEnvironment;
require("dotenv/config");
function required(key) {
    const val = process.env[key];
    if (!val)
        throw new Error(`Missing required environment variable: ${key}`);
    return val;
}
function optional(key, defaultValue) {
    return process.env[key] || defaultValue;
}
function parseIntSafe(key, fallback) {
    const value = parseInt(optional(key, String(fallback)), 10);
    return Number.isFinite(value) ? value : fallback;
}
function parseFloatSafe(key, fallback) {
    const value = parseFloat(optional(key, String(fallback)));
    return Number.isFinite(value) ? value : fallback;
}
const parsedCryptoVolumeThreshold = parseFloat(process.env.CRYPTO_VOLUME_THRESHOLD || '0.6');
const cryptoVolumeThreshold = Number.isFinite(parsedCryptoVolumeThreshold)
    ? parsedCryptoVolumeThreshold
    : 0.6;
exports.config = {
    supabase: {
        url: required('SUPABASE_URL'),
        serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
        anonKey: optional('SUPABASE_ANON_KEY', ''),
    },
    telegram: {
        botToken: required('TELEGRAM_BOT_TOKEN'),
        channelId: optional('TELEGRAM_CHAT_ID', required('TELEGRAM_CHANNEL_ID')),
        // Future multilingual channels (optional)
        channelIdFr: optional('TELEGRAM_CHANNEL_ID_FR', ''),
        channelIdAr: optional('TELEGRAM_CHANNEL_ID_AR', ''),
    },
    marketData: {
        provider: optional('MARKET_DATA_PROVIDER', 'polygon'),
        polygonApiKey: optional('POLYGON_API_KEY', ''),
        alpacaApiKey: optional('ALPACA_API_KEY', ''),
        alpacaApiSecret: optional('ALPACA_API_SECRET', ''),
        finnhubApiKey: optional('FINNHUB_API_KEY', ''),
        twelveDataApiKey: optional('TWELVE_DATA_API_KEY', ''),
    },
    scanner: {
        intervalMinutes: parseIntSafe('SCAN_INTERVAL_MINUTES', 5),
        trackingIntervalMinutes: parseIntSafe('TRACKING_INTERVAL_MINUTES', 2),
        maxSignalsPerDay: parseIntSafe('MAX_SIGNALS_PER_DAY', 10),
        marketSessionFilter: optional('MARKET_SESSION_FILTER', 'true') === 'true',
        minVolumeFilter: parseIntSafe('MIN_VOLUME_FILTER', 500000),
        concurrentStocks: parseIntSafe('SCANNER_CONCURRENCY', parseIntSafe('SCANNER_CONCURRENT_STOCKS', 5)),
        maxStocksPerScan: parseIntSafe('SCANNER_MAX_STOCKS_PER_SCAN', 30),
        batchPauseMs: parseIntSafe('SCAN_BATCH_PAUSE_MS', 500),
        enabledStrategies: optional('ENABLED_STRATEGIES', 'trend_pullback,breakout_volume,support_bounce')
            .split(',')
            .map((s) => s.trim()),
        allowShortSelling: optional('ALLOW_SHORTS', optional('ALLOW_SHORT_SELLING', 'true')) !== 'false',
        defaultWatchlist: optional('SCANNER_DEFAULT_SYMBOLS', 'NVDA,TSLA,META,AMD,MSFT,AAPL,AMZN,NFLX,SPY,QQQ')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        debugSignals: optional('DEBUG_SIGNALS', 'false') === 'true',
        testMode: optional('TEST_MODE', 'false') === 'true',
        watchSignalsInTestMode: optional('WATCH_SIGNALS_IN_TEST_MODE', 'true') === 'true',
    },
    crypto: {
        enabled: optional('ENABLE_CRYPTO', 'false') === 'true',
        provider: optional('CRYPTO_PROVIDER', 'binance').toLowerCase(),
        intervalMinutes: parseIntSafe('CRYPTO_SCAN_INTERVAL_MINUTES', 5),
        trackingIntervalMinutes: parseIntSafe('CRYPTO_TRACKING_INTERVAL_MINUTES', 1),
        maxSignalsPerDay: parseIntSafe('CRYPTO_MAX_SIGNALS_PER_DAY', 30),
        concurrentSymbols: parseIntSafe('CRYPTO_CONCURRENT_SYMBOLS', 2),
        timeframes: optional('CRYPTO_TIMEFRAMES', '5m,15m,1h')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        defaultWatchlist: optional('CRYPTO_DEFAULT_SYMBOLS', optional('CRYPTO_WATCHLIST', 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,LINKUSDT,AVAXUSDT'))
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        prioritySymbols: optional('PRIORITY_SYMBOLS', 'BTCUSDT,ETHUSDT,SOLUSDT')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        debugSignals: optional('DEBUG_SIGNALS', 'false') === 'true',
        minLiquidityVolume: parseIntSafe('CRYPTO_MIN_LIQUIDITY', 500000),
        minRelativeVolume: parseFloatSafe('CRYPTO_MIN_RELATIVE_VOLUME', 1.5),
        volumeThreshold: cryptoVolumeThreshold,
        multiTimeframeConfirmation: optional('MULTI_TIMEFRAME_CONFIRMATION', 'false') === 'true',
        btcBiasEnabled: optional('BTC_BIAS_ENABLED', 'true') === 'true',
        watchSignalsInTestMode: optional('WATCH_SIGNALS_IN_TEST_MODE', 'true') === 'true',
        minRiskReward: parseFloatSafe('CRYPTO_MIN_RR', 2.0),
        enableGridStrategy: optional('ENABLE_GRID_STRATEGY', 'true') === 'true',
        enableBtcLeader: optional('ENABLE_BTC_LEADER', 'true') === 'true',
        enableAdaptiveMomentum: optional('ENABLE_ADAPTIVE_MOMENTUM', 'true') === 'true',
        enableScalpMicrobreakout: optional('ENABLE_SCALP_MICROBREAKOUT', 'true') === 'true',
        enableLiquidityImbalance: optional('ENABLE_LIQUIDITY_IMBALANCE', 'true') === 'true',
        enableDynamicDca: optional('ENABLE_DYNAMIC_DCA', 'true') === 'true',
        allowShortSelling: optional('CRYPTO_ALLOW_SHORTS', optional('ALLOW_SHORTS', optional('ALLOW_SHORT_SELLING', 'true'))) !== 'false',
    },
    risk: {
        maxRiskPerTradePct: parseFloatSafe('MAX_RISK_PER_TRADE_PCT', 1.0),
        minRiskReward: parseFloatSafe('MIN_RISK_REWARD', 2.0),
        maxTradeAgeHours: parseIntSafe('MAX_TRADE_AGE_HOURS', 72),
    },
    ai: {
        enabled: optional('AI_ANALYST_ENABLED', 'true') === 'true',
        model: optional('AI_ANALYST_MODEL', 'gpt-4o-mini'),
        minApprovalConfidence: parseIntSafe('AI_APPROVAL_MIN_CONFIDENCE', 70),
        maxCallsPerDay: parseIntSafe('AI_MAX_CALLS_PER_DAY', 50),
        approvalDisabled: optional('AI_APPROVAL_DISABLED', 'false') === 'true',
        minApprovalScore: parseIntSafe('MIN_AI_SCORE', 45),
    },
    portfolio: {
        maxActiveExposure: parseFloatSafe('PORTFOLIO_MAX_ACTIVE_EXPOSURE', 8),
        targetExposureScore: parseFloatSafe('PORTFOLIO_TARGET_EXPOSURE_SCORE', 6.0),
        correlatedTradeLimit: parseIntSafe('PORTFOLIO_MAX_CORRELATED_TRADES', 3),
        maxSectorExposurePct: parseFloatSafe('PORTFOLIO_MAX_SECTOR_EXPOSURE_PCT', 35.0),
        maxCryptoAllocationPct: parseFloatSafe('PORTFOLIO_MAX_CRYPTO_ALLOCATION_PCT', 50.0),
    },
    riskGuard: {
        consecutiveLossLimit: parseIntSafe('RISK_GUARD_CONSECUTIVE_LOSSES', 3),
        drawdownThresholdPct: parseFloatSafe('RISK_GUARD_DRAWDOWN_THRESHOLD_PCT', 8.0),
        pauseDrawdownPct: parseFloatSafe('RISK_GUARD_PAUSE_DRAWOWN_PCT', 12.0),
    },
    marketSession: {
        enabled: optional('MARKET_SESSION_ADAPTIVE_WEIGHTING', 'true') === 'true',
    },
    executionQuality: {
        enabled: optional('EXECUTION_QUALITY_ENABLED', 'true') === 'true',
        baseSpreadPct: parseFloatSafe('EXECUTION_BASE_SPREAD_PCT', 0.08),
        maxSlippagePct: parseFloatSafe('EXECUTION_MAX_SLIPPAGE_PCT', 0.08),
    },
    reinforcement: {
        enabled: optional('REINFORCEMENT_LEARNING_ENABLED', 'true') === 'true',
    },
    paper: {
        mode: optional('PAPER_MODE', 'false') === 'true',
    },
    security: {
        apiRateLimitPerMinute: parseIntSafe('API_RATE_LIMIT_PER_MINUTE', 180),
        adminToken: optional('ADMIN_API_TOKEN', ''),
        enforceAdminOnControlRoutes: optional('ENFORCE_ADMIN_CONTROL_ROUTES', 'false') === 'true',
    },
    ops: {
        retentionDays: parseIntSafe('RETENTION_DAYS', 180),
        scanTimeoutMs: parseIntSafe('SCAN_TIMEOUT_MS', 45000),
        cryptoScanTimeoutMs: parseIntSafe('CRYPTO_SCAN_TIMEOUT_MS', 90000),
        memoryLimitMb: parseIntSafe('MEMORY_LIMIT_MB', 1024),
    },
    api: {
        port: parseIntSafe('API_PORT', 3000),
        host: optional('API_HOST', '0.0.0.0'),
        enableInternalApi: optional('ENABLE_INTERNAL_API', 'true') === 'true',
    },
    app: {
        nodeEnv: optional('NODE_ENV', 'production'),
        logLevel: optional('LOG_LEVEL', 'info'),
    },
    runtime: {
        enableScanner: optional('ENABLE_SCANNER', 'true') === 'true',
        enableTracking: optional('ENABLE_TRACKING', 'true') === 'true',
        enableWorkers: optional('ENABLE_WORKERS', 'true') === 'true',
        enableCron: optional('ENABLE_CRON', 'true') === 'true',
    },
};
// Startup config logging
console.info(`[CONFIG] Crypto volume threshold loaded: ${exports.config.crypto.volumeThreshold}`);
console.info(`[CONFIG] Crypto enabled: ${exports.config.crypto.enabled}`);
console.info(`[CONFIG] TEST_MODE: ${exports.config.scanner.testMode}`);
console.info(`[CONFIG] Crypto provider: ${exports.config.crypto.provider}`);
console.info(`[SHORT_CONFIG] stocks.allowShortSelling=${exports.config.scanner.allowShortSelling} (ALLOW_SHORTS/ALLOW_SHORT_SELLING) | crypto.allowShortSelling=${exports.config.crypto.allowShortSelling} (CRYPTO_ALLOW_SHORTS/ALLOW_SHORTS/ALLOW_SHORT_SELLING)`);
function validateRuntimeEnvironment() {
    if (exports.config.security.enforceAdminOnControlRoutes && !exports.config.security.adminToken) {
        throw new Error('Missing required ADMIN_API_TOKEN while ENFORCE_ADMIN_CONTROL_ROUTES=true');
    }
    if (!exports.config.telegram.botToken || exports.config.telegram.botToken.length < 20) {
        throw new Error('TELEGRAM_BOT_TOKEN appears invalid or too short');
    }
    if (!exports.config.supabase.serviceRoleKey || exports.config.supabase.serviceRoleKey.length < 20) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY appears invalid or too short');
    }
}
