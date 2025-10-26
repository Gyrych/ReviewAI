/*
功能：后端基路径与错误解析（apiBase）
用途：按环境变量解析各 Agent 的后端基路径；提供标准化的 API 错误解析函数。
参数：
- getAgentBase(agentId)
- parseApiError(payload, status)
返回：
- 基路径字符串与规范化错误对象 { code, message, details }
示例：
// const base = getAgentBase('circuit')
*/
// 中文注释：提供运行时可配置的后端基路径获取接口
// 优先顺序：环境变量（VITE_CIRCUIT_BASE / VITE_CIRCUIT_FINE_BASE / VITE_API_BASE）-> 开发默认 localhost 带端口 -> 相对路径
export function getAgentBase(agentId: 'circuit' | 'circuit-fine') {
  const env = (import.meta as any).env || {}
  if (agentId === 'circuit') {
    if (env.VITE_CIRCUIT_BASE) return env.VITE_CIRCUIT_BASE
    if (env.VITE_API_BASE) return env.VITE_API_BASE.replace(/\/$/, '') + '/circuit-agent'
    // 开发时本地默认端口
    return (env.DEV ? 'http://localhost:4001/api/v1/circuit-agent' : '/api/v1/circuit-agent')
  }
  // circuit-fine
  if (env.VITE_CIRCUIT_FINE_BASE) return env.VITE_CIRCUIT_FINE_BASE
  if (env.VITE_API_BASE) return env.VITE_API_BASE.replace(/\/$/, '') + '/circuit-fine-agent'
  return (env.DEV ? 'http://localhost:4002/api/v1/circuit-fine-agent' : '/api/v1/circuit-fine-agent')
}

export default { getAgentBase }


// 中文注释：统一的 API 错误解析函数，供全局调用
export function parseApiError(payload: any, status: number): { message: string; details?: any } {
  try {
    if (payload && typeof payload === 'object') {
      const code = String((payload.code ?? payload.errorCode ?? '') || '').trim()
      const msg = String((payload.message ?? payload.error ?? '') || '').trim()
      const details = (payload.details !== undefined) ? payload.details : undefined
      const m = msg || (status ? `HTTP ${status}` : '请求失败')
      return { message: code ? `${m} (code: ${code})` : m, details }
    }
    const text = String(payload || '').trim()
    return { message: text || (status ? `HTTP ${status}` : '请求失败') }
  } catch {
    return { message: status ? `HTTP ${status}` : '请求失败' }
  }
}


