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


