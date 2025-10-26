/*
功能：前端提示词健康检查
用途：开发模式下调用后端 /system-prompt 接口以验证提示词存在且可读取。
参数：
- checkPromptHealth(lang?: 'zh'|'en')
返回：
- Promise<{ ok: boolean; status: number; text?: string; error?: string }>
示例：
// const r = await checkPromptHealth('zh')
*/
// 中文注释：在开发模式下用于检查后端提示词健康（存在且可读取）
export async function checkPromptHealth(lang = 'zh') {
  try {
    const base = (import.meta as any).env?.VITE_API_BASE || '/api/v1/circuit-agent'
    const url = `${base.replace(/\/$/, '')}/system-prompt?lang=${encodeURIComponent(lang)}`
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) return { ok: false, status: res.status }
    const text = await res.text()
    return { ok: true, status: res.status, text }
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.message || String(e) }
  }
}

export default { checkPromptHealth }


