"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowNY = nowNY;
exports.isUSMarketOpen = isUSMarketOpen;
exports.isPreMarket = isPreMarket;
exports.formatTimestamp = formatTimestamp;
exports.minutesSince = minutesSince;
exports.hoursSince = hoursSince;
exports.timeframeToMinutes = timeframeToMinutes;
const date_fns_tz_1 = require("date-fns-tz");
const NY_TZ = 'America/New_York';
function nowNY() {
    return (0, date_fns_tz_1.toZonedTime)(new Date(), NY_TZ);
}
function isUSMarketOpen() {
    const now = nowNY();
    const day = now.getDay();
    if (day === 0 || day === 6)
        return false;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const marketOpen = 9 * 60 + 30;
    const marketClose = 16 * 60;
    return totalMinutes >= marketOpen && totalMinutes < marketClose;
}
function isPreMarket() {
    const now = nowNY();
    const day = now.getDay();
    if (day === 0 || day === 6)
        return false;
    const totalMinutes = now.getHours() * 60 + now.getMinutes();
    return totalMinutes >= 4 * 60 && totalMinutes < 9 * 60 + 30;
}
function formatTimestamp(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
}
function minutesSince(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return Math.floor((Date.now() - d.getTime()) / 60000);
}
function hoursSince(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return (Date.now() - d.getTime()) / 3600000;
}
function timeframeToMinutes(timeframe) {
    const map = {
        '1m': 1, '5m': 5, '15m': 15, '30m': 30,
        '1h': 60, '4h': 240, '1d': 1440,
    };
    return map[timeframe] ?? 15;
}
