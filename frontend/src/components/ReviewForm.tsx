import React, { useState } from 'react'
import FileUpload from './FileUpload'

export default function ReviewForm({ onResult }: { onResult: (markdown: string) => void }) {
  // backend endpoint is fixed and not shown to the user
  const apiUrl = '/api/review'
  // model API dropdown default and model name dropdown default
  const [modelApiUrl, setModelApiUrl] = useState('https://api.deepseek.com/beta/chat/completions')
  const [model, setModel] = useState('deepseek-chat')
  const [apiKey, setApiKey] = useState('')
  // default system prompt fields set to '无'
  const [requirements, setRequirements] = useState('无')
  const [specs, setSpecs] = useState('无')
  const [reviewGuidelines, setReviewGuidelines] = useState('无')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState('')
  const [questionConfirm, setQuestionConfirm] = useState('')
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const fd = new FormData()
      // fetch latest system prompt from backend and prepend to prompts
      try {
        const spRes = await fetch('/api/system-prompt')
        if (spRes.ok) {
          const spTxt = await spRes.text()
          // prepend system prompt content to the three system prompt fields
          if (spTxt && spTxt.trim()) {
            // ensure system prompt content appears before user-provided fields
            // we store combined text in requirements field (backend will use them)
            // format: systemPrompt + \n\n + original requirements/specs/reviewGuidelines
            // combine into a single 'systemPrompts' field serialized as JSON
            const systemPromptCombined: { systemPrompt: string; requirements: string; specs: string; reviewGuidelines: string } = {
              systemPrompt: spTxt,
              requirements,
              specs,
              reviewGuidelines,
            }
            // attach as JSON string for backend to parse
            // backend currently expects string fields; send a JSON string as 'systemPrompts'
            // so backend can split systemPrompt and the three prompts
            // preserve original individual fields as well
            // (backend changes may be needed to fully support this)
            // set a hidden form field below
            // We'll append combined later after fd exists
            // append combined JSON directly to form data
            fd.append('systemPrompts', JSON.stringify(systemPromptCombined))
          }
        }
      } catch (e) {
        // ignore system prompt fetch failure and proceed
      }
      files.forEach((f) => fd.append('files', f))
      const modelClean = (model || '').trim()
      const apiUrlClean = (modelApiUrl || '').trim()
      fd.append('model', modelClean)
      // send the chosen model api url with the key expected by backend
      fd.append('apiUrl', apiUrlClean)
      fd.append('requirements', requirements)
      fd.append('specs', specs)
      fd.append('reviewGuidelines', reviewGuidelines)
      // systemPrompts may already be appended above when fetched
      // include conversation history and latest dialog as history
      try {
        const historyToSend = [...history]
        if (dialog && dialog.trim()) historyToSend.push({ role: 'user', content: dialog })
        if (historyToSend.length > 0) fd.append('history', JSON.stringify(historyToSend))
      } catch (e) {}
      // dialog content is used to interact with the large model (also sent as last history entry)
      fd.append('dialog', dialog)

      const headers: Record<string, string> = {}
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

      // Always post to the backend endpoint; backend will forward to the external model at modelApiUrl
      const controller = new AbortController()
      const timeoutMs = 180000 // 180s client-side timeout
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
      let res: Response
      try {
        res = await fetch(apiUrl, { method: 'POST', body: fd, headers, signal: controller.signal })
      } finally {
        clearTimeout(timeoutId)
      }
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `Status ${res.status}`)
      }
      const contentType = res.headers.get('content-type') || ''
      let md = ''
      let qFromJson: any = ''
      if (contentType.includes('application/json')) {
        const j = await res.json()
        md = j.markdown || j.result || ''
        qFromJson = j.questions || j.issues || j.model_feedback || j.model_questions || j.questions_text || ''
        if (!md) md = JSON.stringify(j)
      } else {
        md = await res.text()
      }

      // Split response: only send report starting with marker to ResultView; others to 问题确认
      const marker = '【评审报告】'
      const idx = md.indexOf(marker)
      const reportPart = idx >= 0 ? md.slice(idx) : ''
      const otherPart = idx >= 0 ? md.slice(0, idx) : md
      const parts: string[] = []
      if (qFromJson) parts.push(typeof qFromJson === 'string' ? qFromJson : JSON.stringify(qFromJson, null, 2))
      if (otherPart && otherPart.trim()) parts.push(otherPart.trim())
      if (parts.length > 0) setQuestionConfirm(parts.join('\n\n'))
      if (reportPart.trim()) onResult(reportPart.trim())
    } catch (err: any) {
      const msg = err?.message || ''
      if (err?.name === 'AbortError' || /aborted/i.test(msg)) {
        setError('请求超时：上游响应较慢或网络不稳定，请尝试切换为 /beta 路径或稍后重试。')
      } else {
        setError(msg || '提交失败')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">模型 API 地址</label>
          <select value={modelApiUrl} onChange={(e) => setModelApiUrl(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2">
            <option value="https://api.deepseek.com/beta/chat/completions">https://api.deepseek.com/beta/chat/completions</option>
            <option value="https://api.deepseek.com/chat/completions">https://api.deepseek.com/chat/completions</option>
            <option value="https://api.deepseek.com">https://api.deepseek.com (auto paths)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">提示：若上游返回 404/400，请尝试选择带 <code>/beta</code> 的路径或在下拉中切换。</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">模型名称</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2">
            <option value="deepseek-chat">deepseek-chat</option>
            <option value="deepseek-reasoner">deepseek-reasoner</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">API Key</label>
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">设计需求（系统提示）</label>
          <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">设计规范（系统提示）</label>
          <textarea value={specs} onChange={(e) => setSpecs(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">评审规范（系统提示）</label>
          <textarea value={reviewGuidelines} onChange={(e) => setReviewGuidelines(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border px-3 py-2" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">文件上传</label>
        <div className="mt-2">
          <FileUpload files={files} onChange={setFiles} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">对话（与模型交互）</label>
          <textarea value={dialog} onChange={(e) => setDialog(e.target.value)} rows={4} className="mt-1 block w-full rounded-md border px-3 py-2" placeholder="输入与大模型的对话/问题" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">问题确认（模型反馈）</label>
          <textarea value={questionConfirm} readOnly rows={4} className="mt-1 block w-full rounded-md border px-3 py-2 bg-gray-50" placeholder="模型返回的问题或疑问将显示在此" />
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex items-center space-x-2">
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md" disabled={loading}>
          {loading ? '提交中...' : '提交'}
        </button>
        <button type="button" className="px-4 py-2 bg-gray-200 rounded-md" onClick={() => { setDialog(''); setQuestionConfirm('') }}>
          清除对话
        </button>
      </div>
    </form>
  )
}


