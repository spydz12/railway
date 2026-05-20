import 'dotenv/config';

const REQUIRED_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'NODE_ENV',
  'ENABLE_SCANNER',
  'ENABLE_TRACKING',
  'ENABLE_WORKERS',
  'ENABLE_CRON',
] as const;

const BOOLEAN_KEYS = [
  'ENABLE_SCANNER',
  'ENABLE_TRACKING',
  'ENABLE_WORKERS',
  'ENABLE_CRON',
] as const;

function isBooleanString(value: string): boolean {
  return value === 'true' || value === 'false';
}

export function validateDeploymentEnv(): void {
  const missing: string[] = [];

  // Backward-compatible telegram chat ID fallback.
  if (!process.env.TELEGRAM_CHAT_ID && process.env.TELEGRAM_CHANNEL_ID) {
    process.env.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHANNEL_ID;
  }

  if (!process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID.trim().length === 0) {
    missing.push('TELEGRAM_CHAT_ID');
  }

  for (const key of REQUIRED_KEYS) {
    const val = process.env[key];
    if (!val || val.trim().length === 0) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required deployment environment variables: ${missing.join(', ')}`);
  }

  for (const key of BOOLEAN_KEYS) {
    const value = process.env[key] as string;
    if (!isBooleanString(value)) {
      throw new Error(`${key} must be 'true' or 'false'`);
    }
  }

  const nodeEnv = process.env.NODE_ENV as string;
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of development|production|test. Received: ${nodeEnv}`);
  }
}
