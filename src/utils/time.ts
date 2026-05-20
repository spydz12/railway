import { toZonedTime } from 'date-fns-tz';

const NY_TZ = 'America/New_York';

export function nowNY(): Date {
  return toZonedTime(new Date(), NY_TZ);
}

export function isUSMarketOpen(): boolean {
  const now = nowNY();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;
  return totalMinutes >= marketOpen && totalMinutes < marketClose;
}

export function isPreMarket(): boolean {
  const now = nowNY();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  return totalMinutes >= 4 * 60 && totalMinutes < 9 * 60 + 30;
}

export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
}

export function minutesSince(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

export function hoursSince(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return (Date.now() - d.getTime()) / 3600000;
}

export function timeframeToMinutes(timeframe: string): number {
  const map: Record<string, number> = {
    '1m': 1, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '4h': 240, '1d': 1440,
  };
  return map[timeframe] ?? 15;
}
