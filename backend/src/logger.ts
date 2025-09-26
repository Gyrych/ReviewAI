import fs from 'fs'
import path from 'path'

const logsDir = path.join(__dirname, '..', 'logs')
const logFile = path.join(logsDir, 'app.log')

if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true })
  } catch (e) {
    // ignore
  }
}

function timestamp(): string {
  return new Date().toISOString()
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  const entry = { ts: timestamp(), level: 'info', message, meta }
  try {
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n')
  } catch (e) {
    // fallback to console
    console.log('[logger-fallback]', entry)
  }
}

export function logError(message: string, meta?: Record<string, unknown>) {
  const entry = { ts: timestamp(), level: 'error', message, meta }
  try {
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n')
  } catch (e) {
    console.error('[logger-fallback]', entry)
  }
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  const entry = { ts: timestamp(), level: 'warn', message, meta }
  try {
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n')
  } catch (e) {
    console.warn('[logger-fallback]', entry)
  }
}

export function readRecentLines(maxLines = 200): string[] {
  try {
    if (!fs.existsSync(logFile)) return []
    const data = fs.readFileSync(logFile, 'utf8')
    const lines = data.trim().split(/\r?\n/)
    return lines.slice(-maxLines)
  } catch (e) {
    return [`error reading logs: ${String(e)}`]
  }
}


