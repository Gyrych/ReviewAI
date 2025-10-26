/*
功能：错误诊断组件（ErrorDiagnostic）
用途：统一展示 API 错误信息，并提供一键导出诊断工件（调用 /diagnostics/export）。
参数：
- message: string 错误文案
- details?: any 额外详情对象
- agentBase: string 后端基路径
- progressId?: string 进度标识，用于归档诊断
返回：
- React 组件
示例：
// <ErrorDiagnostic message="失败" agentBase={base} progressId={id} />
*/
import React from 'react'

type Props = {
  message: string
  details?: any
  agentBase: string
  progressId?: string | null
}

export default function ErrorDiagnostic(props: Props) {
  const { message, details, agentBase, progressId } = props

  async function handleExport() {
    try {
      const body = { sessionId: progressId || `s_${Date.now()}` }
      const res = await fetch(`${agentBase}/diagnostics/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(await res.text())
      const j = await res.json()
      const url = j?.artifactUrl
      if (url) {
        try { window.open(url, '_blank') } catch { /* 忽略 */ }
      }
    } catch (e) {
      // 静默失败，避免叠加错误
    }
  }

  return (
    <div className="mt-3 p-3 border rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200">
      <div className="font-semibold">错误</div>
      <div className="text-sm whitespace-pre-wrap break-words">{message}</div>
      {details ? (<pre className="mt-2 text-xs opacity-80 overflow-auto max-h-40">{typeof details === 'string' ? details : JSON.stringify(details, null, 2)}</pre>) : null}
      <div className="mt-3">
        <button onClick={handleExport} className="px-3 py-1 border rounded bg-white hover:bg-gray-50 text-sm">导出诊断</button>
      </div>
    </div>
  )
}


