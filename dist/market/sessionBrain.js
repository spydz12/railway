"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketSession = getMarketSession;
function clampHour(hour) {
    return ((hour % 24) + 24) % 24;
}
function getMarketSession(marketType, now = new Date()) {
    const utcHour = now.getUTCHours();
    const weekday = now.getUTCDay();
    if (marketType === 'stocks') {
        const estHour = clampHour(utcHour - 4); // approximate US Eastern time
        if (estHour >= 4 && estHour < 9) {
            return { marketType, session: 'premarket', description: 'Premarket liquidity and gap discovery' };
        }
        if (estHour >= 9 && estHour < 10.5) {
            return { marketType, session: 'open_volatility', description: 'Opening range and high volatility' };
        }
        if (estHour >= 10.5 && estHour < 15.5) {
            return { marketType, session: 'midday_chop', description: 'Midday consolidation and chop' };
        }
        if (estHour >= 15.5 && estHour < 16) {
            return { marketType, session: 'power_hour', description: 'Power hour and end-of-day flow' };
        }
        return { marketType, session: 'after_hours', description: 'After-hours trading and news absorption' };
    }
    const isWeekend = weekday === 0 || weekday === 6;
    if (isWeekend) {
        return { marketType, session: 'weekend', description: 'Weekend crypto liquidity and lower volume' };
    }
    if (utcHour >= 0 && utcHour < 8) {
        return { marketType, session: 'asia', description: 'Asia session with localized moves' };
    }
    if (utcHour >= 8 && utcHour < 16) {
        return { marketType, session: 'london', description: 'London session and European flow' };
    }
    if (utcHour >= 13 && utcHour < 21) {
        return { marketType, session: 'new_york_overlap', description: 'New York overlap and highest liquidity' };
    }
    return { marketType, session: 'late_night', description: 'Late night crypto trading' };
}
