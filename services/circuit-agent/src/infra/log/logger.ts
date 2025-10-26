/*
功能：轻量日志器（JSON 行）
用途：在控制台输出结构化日志，便于本地/CI/收集系统统一检索与分析。
参数：
- logger.debug/info/warn/error(message: string, meta?: any)
返回：
- 无（副作用：输出一行 JSON 字符串到 stdout）
示例：
// logger.info('server_started', { port })
*/
// 中文注释：轻量日志器，将关键信息以 JSON 行输出到 stdout，便于收集/检索
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function baseLog(level: LogLevel, message: string, meta?: any) {
  try {
    // 避免循环引用
    const safeMeta = (() => {
      try { return meta === undefined ? undefined : JSON.parse(JSON.stringify(meta)) } catch { return undefined }
    })()
    const line = { ts: new Date().toISOString(), level, message, meta: safeMeta }
    // 输出单行 JSON，便于收集到日志系统或重定向到文件
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(line))
  } catch {
    // 忽略日志错误，避免影响主流程
  }
}

export const logger = {
  debug(message: string, meta?: any) { baseLog('debug', message, meta) },
  info(message: string, meta?: any) { baseLog('info', message, meta) },
  warn(message: string, meta?: any) { baseLog('warn', message, meta) },
  error(message: string, meta?: any) { baseLog('error', message, meta) }
}


