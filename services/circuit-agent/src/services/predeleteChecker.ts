/**
 * 删除前依赖/影响检查（示例实现）
 */
export function canDeleteAnnotatedMessage(id: string) {
  // TODO: 查询数据库/索引，判断是否有外部引用
  return { ok: true, reason: '' }
}


