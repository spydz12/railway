# Railway Deployment

## Target Runtime
- Platform: Railway
- Process role: bot workers + scanner + tracking + cron + telegram + internal API
- Database: Supabase

## Required Railway Variables
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- TELEGRAM_CHANNEL_ID
- NODE_ENV=production
- ENABLE_INTERNAL_API=true
- API_HOST=0.0.0.0
- API_PORT=3000
- ENABLE_SCANNER=true
- ENABLE_TRACKING=true
- ENABLE_WORKERS=true
- ENABLE_CRON=true

## Start Command
- npm run start:railway

## Health URL
- /api/health
- Example response:
  - scanner
  - tracking
  - telegram
  - database
  - heartbeat

## Worker Architecture
- Scanner jobs: src/workers/scannerWorker.ts
- Tracking jobs: src/workers/trackerWorker.ts
- Worker jobs: src/workers/paperWorker.ts
- Cron jobs: src/workers/opsWorker.ts
- Bootstrap orchestration: src/bootstrap/index.ts

## Scaling
- Recommended: one primary Railway service for scheduler + tracking + telegram dispatch
- Optional: split scanner and tracker by using start:scanner / start:tracking scripts in separate services

## Restart Behavior
- Railway restarts the process on deploy or crash
- Startup validates required env vars and exits on missing values
- /api/health heartbeat updates every 30 seconds after bootstrap
