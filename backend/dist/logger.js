"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logInfo = logInfo;
exports.logError = logError;
exports.readRecentLines = readRecentLines;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logsDir = path_1.default.join(__dirname, '..', 'logs');
const logFile = path_1.default.join(logsDir, 'app.log');
if (!fs_1.default.existsSync(logsDir)) {
    try {
        fs_1.default.mkdirSync(logsDir, { recursive: true });
    }
    catch (e) {
        // ignore
    }
}
function timestamp() {
    return new Date().toISOString();
}
function logInfo(message, meta) {
    const entry = { ts: timestamp(), level: 'info', message, meta };
    try {
        fs_1.default.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    }
    catch (e) {
        // fallback to console
        console.log('[logger-fallback]', entry);
    }
}
function logError(message, meta) {
    const entry = { ts: timestamp(), level: 'error', message, meta };
    try {
        fs_1.default.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    }
    catch (e) {
        console.error('[logger-fallback]', entry);
    }
}
function readRecentLines(maxLines = 200) {
    try {
        if (!fs_1.default.existsSync(logFile))
            return [];
        const data = fs_1.default.readFileSync(logFile, 'utf8');
        const lines = data.trim().split(/\r?\n/);
        return lines.slice(-maxLines);
    }
    catch (e) {
        return [`error reading logs: ${String(e)}`];
    }
}
