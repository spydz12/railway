import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';

interface RateRecord {
  count: number;
  windowStart: number;
}

const rateMap = new Map<string, RateRecord>();

function sanitize(value: string): string {
  return value.replace(/[<>;$`]/g, '').trim();
}

export function sanitizeRequest(request: FastifyRequest): void {
  if (request.query && typeof request.query === 'object') {
    for (const [key, value] of Object.entries(request.query as Record<string, unknown>)) {
      if (typeof value === 'string') {
        (request.query as Record<string, unknown>)[key] = sanitize(value);
      }
    }
  }

  if (request.params && typeof request.params === 'object') {
    for (const [key, value] of Object.entries(request.params as Record<string, unknown>)) {
      if (typeof value === 'string') {
        (request.params as Record<string, unknown>)[key] = sanitize(value);
      }
    }
  }
}

export function enforceRateLimit(request: FastifyRequest, reply: FastifyReply): boolean {
  const maxPerMinute = config.security.apiRateLimitPerMinute;
  const ip = request.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60_000;

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

export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.security.adminToken) {
    reply.code(500).send({ error: 'admin_not_configured' });
    return false;
  }

  const token = request.headers['x-admin-token'];
  if (token !== config.security.adminToken) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }

  return true;
}
