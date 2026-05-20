"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDeploymentEnv = validateDeploymentEnv;
require("dotenv/config");
const REQUIRED_KEYS = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'TELEGRAM_BOT_TOKEN',
    'NODE_ENV',
    'ENABLE_SCANNER',
    'ENABLE_TRACKING',
    'ENABLE_WORKERS',
    'ENABLE_CRON',
];
const BOOLEAN_KEYS = [
    'ENABLE_SCANNER',
    'ENABLE_TRACKING',
    'ENABLE_WORKERS',
    'ENABLE_CRON',
];
function isBooleanString(value) {
    return value === 'true' || value === 'false';
}
function validateDeploymentEnv() {
    const missing = [];
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
        const value = process.env[key];
        if (!isBooleanString(value)) {
            throw new Error(`${key} must be 'true' or 'false'`);
        }
    }
    const nodeEnv = process.env.NODE_ENV;
    if (!['development', 'production', 'test'].includes(nodeEnv)) {
        throw new Error(`NODE_ENV must be one of development|production|test. Received: ${nodeEnv}`);
    }
}
