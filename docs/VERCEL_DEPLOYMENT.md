# Vercel Deployment

## Scope
- Vercel runs dashboard UI only (Next.js frontend)
- Bot workers must not run on Vercel

## Required Runtime Mode
Set these environment variables for any backend process that could be executed in a Vercel-like environment:
- ENABLE_SCANNER=false
- ENABLE_TRACKING=false
- ENABLE_WORKERS=false
- ENABLE_CRON=false

## Why
- Vercel functions are serverless and ephemeral
- Long-running loops, cron jobs, and in-memory worker state are not reliable there

## Recommended Architecture
- Railway: all bot runtime services
- Vercel: dashboard pages only
- Supabase: data and auth/storage

## Deployment Note
- Dashboard deployment page surfaces blocker warnings and service states
- If hosted on a Vercel domain, UI displays: Bot workers disabled
