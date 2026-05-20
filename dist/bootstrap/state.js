"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRuntimeService = setRuntimeService;
exports.touchHeartbeat = touchHeartbeat;
exports.getRuntimeHealth = getRuntimeHealth;
const runtimeHealth = {
    scanner: false,
    tracking: false,
    workers: false,
    cron: false,
    telegram: false,
    database: false,
    heartbeat: new Date().toISOString(),
};
function setRuntimeService(key, value) {
    runtimeHealth[key] = value;
}
function touchHeartbeat() {
    runtimeHealth.heartbeat = new Date().toISOString();
}
function getRuntimeHealth() {
    return { ...runtimeHealth };
}
