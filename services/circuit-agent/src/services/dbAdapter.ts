/**
 * 可选的 SQLite 适配器（最小实现）
 *
 * 说明：本适配器尝试动态加载 `better-sqlite3`。若不可用，则返回 null，
 * 上层服务将回退到文件存储实现。
 */
let BetterSqlite3: any = null
try {
  // 动态加载，避免在缺少依赖时引发构建错误
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BetterSqlite3 = require('better-sqlite3')
} catch (e) {
  BetterSqlite3 = null
}

export function createDb(dbPath: string) {
  if (!BetterSqlite3) return null
  try {
    const db = new BetterSqlite3(dbPath)
    return db
  } catch (e) {
    return null
  }
}

export default { createDb }


