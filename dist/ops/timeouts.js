"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTimeout = withTimeout;
async function withTimeout(promise, timeoutMs, label) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        promise
            .then((value) => {
            clearTimeout(timeout);
            resolve(value);
        })
            .catch((error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}
