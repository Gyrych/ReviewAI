export function validateDeleteRequest(body: any) {
  if (!body || !body.id) return { ok: false, error: 'missing id' }
  // 进一步权限校验/格式校验可在此扩展
  return { ok: true }
}


