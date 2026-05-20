# AI Stock Trade Ideas Telegram Bot

A production-ready, real market data-driven stock trade idea engine that sends complete trade setups to Telegram with full lifecycle tracking — from entry to exit.

## What This Is

This is NOT an auto-trading bot. It generates professional trade ideas based on real market data and sends them to a Telegram channel for **manual execution on eToro**.

Every signal comes from real price data. Every trade idea is tracked until it hits a target, triggers a stop, or expires.

---

## Features

- Real market data from Polygon, Alpaca, Finnhub, or Twelve Data
- 3 implemented strategies: Trend Pullback, Breakout + Volume, Support Bounce
- Full trade idea lifecycle: entry → TP1 → TP2 → stop/invalidation/expiry
- Telegram alerts: initial idea + follow-up status updates
- Configurable risk management (R:R ratio, max risk, signal limits)
- Multilingual channel support (EN default, FR/AR ready)
- Internal REST API for health checks and monitoring
- PostgreSQL via Supabase for persistent storage
- Docker-ready for production deployment

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (from your Supabase project)
- `TELEGRAM_BOT_TOKEN` (from @BotFather)
- `TELEGRAM_CHANNEL_ID` (your channel ID)
- At least one market data API key

### 3. Run locally

```bash
npm run dev
```

### 4. Build for production

```bash
npm run build
npm start
```

---

## Market Data Providers

Set `MARKET_DATA_PROVIDER` to your preferred provider. The system automatically falls back to any configured provider.

| Provider | Free Tier | Rate Limit | Best For |
|---|---|---|---|
| **Polygon** | Basic delayed data | 5/min (free) | Real-time on paid |
| **Alpaca** | Real-time SIP data | 200/min | Best free option |
| **Finnhub** | Delayed + some real-time | 60/min | Good coverage |
| **Twelve Data** | 800 calls/day | 8/min | Easy setup |

**Recommendation:** Start with Alpaca (free, real-time data) or Polygon (paid for production).

---

## Strategies

### Trend Pullback
- EMA20 > EMA50 (uptrend)
- Price pulls back near EMA20
- RSI between 50–70
- Bullish confirmation candle

### Breakout + Volume
- Price breaks above resistance level
- Volume spike ≥ 1.5x average
- Candle closes in upper half of range

### Support Bounce
- Price touches strong support zone
- Hammer or bullish engulfing candle
- Volume ≥ 1.2x average confirmation

---

## Telegram Message Format

**Initial Alert:**
```
🚨 STOCK TRADE IDEA
🟢 AAPL (Apple Inc.)

📋 Setup Details
Direction: BUY
Entry Zone: $198.20 – $198.80
Stop Loss: $195.90
TP1: $201.50
TP2: $204.00

📊 Strategy Info
Strategy: Breakout Volume
Confidence: 78%
Timeframe: 15m
Risk/Reward: 1:2.3

💡 Analysis
[Strategy reasoning]

⚠️ Invalidation
[Invalidation rule]
```

**Follow-up Updates:**
- ✅ Entry Triggered
- 🎯 TP1 Reached
- 🎯🎯 TP2 Reached (Full Target)
- ❌ Stop Loss Hit
- ⚠️ Breakout Failed
- ⏰ Time Exit Triggered

---

## Docker Deployment

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## Internal API

Available at `http://localhost:3000` when `ENABLE_INTERNAL_API=true`.

| Endpoint | Description |
|---|---|
| `GET /health` | System health, provider status, market hours |
| `GET /ideas` | Recent trade ideas (default 20, max 100) |
| `GET /ideas/active` | Currently active trade ideas |
| `GET /ideas/:id/updates` | All updates for a specific idea |
| `GET /settings` | Current runtime settings |
| `GET /providers` | Provider configuration status |

---

## Project Structure

```
src/
├── config/          # Environment-based configuration
├── database/        # Supabase client + all queries
├── providers/       # Market data providers (Polygon, Alpaca, Finnhub, TwelveData)
├── strategies/      # Trading strategy implementations
├── engine/          # Strategy runner, validator, setup selector
├── risk/            # Risk/reward calculator
├── ideas/           # Trade idea builder
├── tracking/        # Active idea monitor (price tracking)
├── telegram/        # Bot + message formatter
├── scanner/         # Watchlist scanner
├── workers/         # Cron-based background jobs
├── api/             # Internal Fastify REST API
├── utils/           # Logger, indicators, time utilities
└── index.ts         # Application entry point
```

---

## Adding Stocks to the Watchlist

The default watchlist includes 25 major US stocks and ETFs. To add more:

```sql
INSERT INTO stocks (ticker, company_name, sector, active, min_volume)
VALUES ('SNOW', 'Snowflake Inc.', 'Technology', true, 3000000);
```

Or add directly in the Supabase dashboard under the `stocks` table.

---

## Adding a New Strategy

1. Create `src/strategies/myStrategy.ts` implementing the `Strategy` interface
2. Add it to `src/strategies/index.ts` in `ALL_STRATEGIES`
3. Add a seed row to the `strategies` table
4. Add the slug to `ENABLED_STRATEGIES` in `.env`

---

## Configuration Reference

| Variable | Default | Description |
|---|---|---|
| `SCAN_INTERVAL_MINUTES` | 5 | How often to scan for new setups |
| `TRACKING_INTERVAL_MINUTES` | 2 | How often to check active ideas |
| `MAX_SIGNALS_PER_DAY` | 10 | Max alerts per day |
| `MARKET_SESSION_FILTER` | true | Only scan during market hours |
| `MIN_VOLUME_FILTER` | 500000 | Min avg daily volume |
| `MIN_RISK_REWARD` | 2.0 | Minimum R:R ratio |
| `MAX_RISK_PER_TRADE_PCT` | 1.0 | Max risk % per trade |
| `MAX_TRADE_AGE_HOURS` | 72 | Auto-expire ideas after N hours |
| `ALLOW_SHORT_SELLING` | false | Enable SELL/SHORT direction |

---

## Adding Multilingual Channels

1. Set `TELEGRAM_CHANNEL_ID_FR` and/or `TELEGRAM_CHANNEL_ID_AR` in `.env`
2. Create translated versions of the formatters in `src/telegram/formatter.ts`
3. Call them in `src/telegram/bot.ts` alongside the English message

---

## License

Private. All rights reserved.
