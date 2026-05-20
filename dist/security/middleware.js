"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeRequest = sanitizeRequest;
exports.enforceRateLimit = enforceRateLimit;
exports.requireAdmin = requireAdmin;
const config_1 = require("../config");
const rateMap = new Map();
function sanitize(value) {
    return value.replace(/[<>;$`]/g, '').trim();
}
function sanitizeRequest(request) {
    if (request.query && typeof request.query === 'object') {
        for (const [key, value] of Object.entries(request.query)) {
            if (typeof value === 'string') {
                request.query[key] = sanitize(value);
            }
        }
    }
    if (request.params && typeof request.params === 'object') {
        for (const [key, value] of Object.entries(request.params)) {
            if (typeof value === 'string') {
                request.params[key] = sanitize(value);
            }
        }
    }
}
function enforceRateLimit(request, reply) {
    const maxPerMinute = config_1.config.security.apiRateLimitPerMinute;
    const ip = request.ip || 'unknown';
    const now = Date.now();
    const windowMs = 60000;
    const record = rateMap.get(ip) ?? { count: 0, windowStart: now };
    if (now - record.windowStart >= windowMs) {
        record.count = 0;
        record.windowStart = now;
    }
    record.count += 1;
    rateMap.set(ip, record);
    if (record.count > maxPerMinute) {
        reply.code(429).send({ error: 'rate_limited', message: 'Too many requests' });
        return false;
    }
    return true;
}
function requireAdmin(request, reply) {
    if (!config_1.config.security.adminToken) {
        reply.code(500).send({ error: 'admin_not_configured' });
        return false;
    }
    const token = request.headers['x-admin-token'];
    if (token !== config_1.config.security.adminToken) {
        reply.code(401).send({ error: 'unauthorized' });
        return false;
    }
    return true;
}
