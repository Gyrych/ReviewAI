import React, { useState, useEffect, useRef } from 'react'
import FileUpload from './FileUpload'

export default function ReviewForm({
  onResult,
  setEnrichedJson,
  setOverlay,
  modelApiUrl,
  customApiUrl,
  model,
  customModelName,
  setCustomModelName,
  apiKey,
  allowedApiUrls,
  onSavePair,
}: {
  onResult: (markdown: string) => void
  setEnrichedJson?: (j: any) => void
  setOverlay?: (o: any) => void
  modelApiUrl: string
  customApiUrl: string
  model: string
  customModelName: string
  setCustomModelName: (v: string) => void
  apiKey: string
  allowedApiUrls: string[]
  onSavePair?: (api: string, model: string) => void
}) {
  // backend endpoint is fixed and not shown to the user
  const apiUrl = '/api/review'
  const [apiUrlError, setApiUrlError] = useState<string | null>(null)
  // default system prompt fields set to '无'
  const [requirements, setRequirements] = useState('无')
  const [specs, setSpecs] = useState('无')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  // 会话进度与计时器
  const [progressStep, setProgressStep] = useState<string>('idle')
  const [elapsedMs, setElapsedMs] = useState<number>(0)
  const timerRef = useRef<number | null>(null)
  // 步骤名称映射为中文友好显示
  const STEP_LABELS: Record<string, string> = {
    idle: '空闲',
    preparing: '准备中',
    uploading_files: '上传文件',
    using_cached_enriched_json: '使用已解析数据',
    sending_request: '发送请求',
    done: '完成',
    images_processing_start: '图像处理 - 开始',
    images_processing_done: '图像处理 - 完成',
    llm_request_start: '调用模型 - 开始',
    llm_request_done: '调用模型 - 完成',
  }
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState('')
  const [questionConfirm, setQuestionConfirm] = useState('')
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [localEnrichedJson, setLocalEnrichedJson] = useState<any | null>(null)

  const questionRef = useRef<HTMLTextAreaElement | null>(null)
  const dialogRef = useRef<HTMLTextAreaElement | null>(null)

  // derived when needed inside handleSubmit

  function adjustHeight(el?: HTMLTextAreaElement | null) {
    if (!el) return
    try {
      el.style.height = 'auto'
      const h = el.scrollHeight
      el.style.height = h + 'px'
    } catch (e) {}
  }

  useEffect(() => {
    adjustHeight(questionRef.current)
  }, [questionConfirm])

  useEffect(() => {
    adjustHeight(dialogRef.current)
  }, [dialog])

  // NOTE: modelApiUrl, model, modelOptions and related persistence are managed by parent (App).

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    // 启动计时与初始步骤
    setProgressStep('preparing')
    setElapsedMs(0)
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = window.setInterval(() => setElapsedMs((s) => s + 1000), 1000)
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
            // format: systemPrompt + \n\n + original requirements/specs
            // combine into a single 'systemPrompts' field serialized as JSON
            const systemPromptCombined: { systemPrompt: string; requirements: string; specs: string } = {
              systemPrompt: spTxt,
              requirements,
              specs,
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
      // 如果已有后端返回的 enrichedJson（图片已解析为描述），则不需要重复上传图片
      if (!localEnrichedJson) {
        setProgressStep('uploading_files')
        files.forEach((f) => fd.append('files', f))
      } else {
        // 将已生成的图片描述（结构化 JSON）随表单一并发送，便于后端复用而非二次识别
        setProgressStep('using_cached_enriched_json')
        try { fd.append('enrichedJson', JSON.stringify(localEnrichedJson)) } catch (e) {}
      }
      // 若为自定义 API，则优先使用 customModelName（若有），否则使用下拉的 model 值
      const apiUrlClean = (modelApiUrl === 'custom' ? (customApiUrl || '').trim() : (modelApiUrl || '').trim())
      const isOpenRouterSelected = (apiUrlClean || '').startsWith('https://openrouter.ai')
      const isCustomModelMode = modelApiUrl === 'custom' || isOpenRouterSelected
      const modelClean = (isCustomModelMode ? ((customModelName && customModelName.trim()) ? customModelName.trim() : (model || '').trim()) : (model || '').trim())
      // 如果是自定义地址（未列入 allowedApiUrls），给出非阻断性的友好提示并允许提交
      if (!allowedApiUrls.includes(apiUrlClean)) {
        setApiUrlError('提示：您使用的是自定义或未知的 API 地址，系统不会验证其可用性。若上游返回错误，请检查地址或切换到下拉中的受支持地址。')
      } else {
        setApiUrlError(null)
      }
      fd.append('model', modelClean)
      // send the chosen model api url with the key expected by backend
      fd.append('apiUrl', apiUrlClean)
      fd.append('requirements', requirements)
      fd.append('specs', specs)
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
      setProgressStep('sending_request')
      const controller = new AbortController()
      // 客户端等待后端响应的超时（毫秒），可通过 Vite 环境变量 VITE_CLIENT_TIMEOUT_MS 配置，默认 1800000（30 分钟）
      // 在浏览器中不可直接访问 process.env，使用 import.meta.env（由 Vite 在构建时注入）
      const timeoutMs = Number((import.meta as any).env.VITE_CLIENT_TIMEOUT_MS || 1800000)
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
      // 若请求成功且使用了自定义 api/model 配对，则通知父组件保存该配对以便加入下拉
      try {
        if (res.ok) {
          const usedApi = apiUrlClean
          const usedModel = modelClean
          if (usedApi && !allowedApiUrls.includes(usedApi) && typeof onSavePair === 'function') {
            try { onSavePair(usedApi, usedModel) } catch (e) {}
          }
        }
      } catch (e) {}
      const contentType = res.headers.get('content-type') || ''
      let md = ''
      let qFromJson: any = ''
      // 如果后端返回包含 timeline，则使用该信息更新进度与计时显示
      if (contentType.includes('application/json')) {
        const peek = await res.clone().json().catch(() => null)
        if (peek && peek.timeline && Array.isArray(peek.timeline)) {
          // 计算后端最后一个时间戳并更新 elapsedMs
          try {
            const last = peek.timeline[peek.timeline.length - 1]
            if (last && last.ts) {
              const now = Date.now()
              setElapsedMs(Math.max(0, now - peek.timeline[0].ts))
            }
          } catch (e) {}
        }
      }

      if (contentType.includes('application/json')) {
        const j = await res.json()
        // 存储后端返回的 enrichedJson 以便后续提交复用（避免二次上传图片）
        if (j.enrichedJson) {
          const parsed = (typeof j.enrichedJson === 'string') ? JSON.parse(j.enrichedJson) : j.enrichedJson
          try { setLocalEnrichedJson(parsed) } catch (e) {}
          if (typeof setEnrichedJson === 'function') setEnrichedJson(parsed)
        }
        if (j.overlay && typeof setOverlay === 'function') setOverlay(j.overlay)
        md = j.markdown || j.result || ''
        qFromJson = j.questions || j.issues || j.model_feedback || j.model_questions || j.questions_text || ''
        if (!md) md = JSON.stringify(j)
      } else {
        md = await res.text()
      }

      // 显示逻辑容错：
      // 1) 若包含“【评审报告】”标记，按原逻辑分割展示
      // 2) 若不包含且文本以“【问题确认】”为主，则仅展示到“问题确认”区
      // 3) 若不包含且非“问题确认”文本，则将全文作为评审结果展示
      const marker = '【评审报告】'
      const idx = md.indexOf(marker)
      const hasReport = idx >= 0
      const questionParts: string[] = []
      if (qFromJson) questionParts.push(typeof qFromJson === 'string' ? qFromJson : JSON.stringify(qFromJson, null, 2))

      if (hasReport) {
        const reportPart = md.slice(idx)
        const otherPart = md.slice(0, idx)
        if (otherPart && otherPart.trim()) questionParts.push(otherPart.trim())
        if (questionParts.length > 0) setQuestionConfirm(questionParts.join('\n\n'))
        if (reportPart.trim()) {
          onResult(reportPart.trim())
          // 将 assistant 的回复追加到 history，保证后续提交包含该回复
          setHistory((h) => h.concat([{ role: 'assistant', content: reportPart.trim() }]))
        }
      } else {
        const looksLikeQuestion = /^\s*【问题确认】/.test(md) || md.includes('【问题确认】')
        if (looksLikeQuestion) {
          const qText = md && md.trim() ? md.trim() : ''
          const combined = questionParts.concat(qText ? [qText] : [])
          if (combined.length > 0) setQuestionConfirm(combined.join('\n\n'))
          // 不展示结果视图，等待用户补充信息后再提交
          // 同样记录 assistant 输出到 history
          if (qText) setHistory((h) => h.concat([{ role: 'assistant', content: qText }]))
        } else {
          // 将全文作为评审结果展示
          if (questionParts.length > 0) setQuestionConfirm(questionParts.join('\n\n'))
          if (md && md.trim()) {
            onResult(md.trim())
            setHistory((h) => h.concat([{ role: 'assistant', content: md.trim() }]))
          }
        }
      }
    } catch (err: any) {
      const msg = err?.message || ''
      if (err?.name === 'AbortError' || /aborted/i.test(msg)) {
        setError('请求超时：上游响应较慢或网络不稳定，请尝试切换为 /beta 路径或稍后重试。')
      } else {
        setError(msg || '提交失败')
      }
    } finally {
      setLoading(false)
      setProgressStep('done')
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 在 App 中统一渲染模型 API / 模型名称 / API Key，ReviewForm 中仅保留文件上传与提示 */}
      <div>
        <div>
          <label className="block text-sm font-medium text-gray-700">文件上传</label>
          <div className="mt-2">
            <FileUpload files={files} onChange={setFiles} />
          </div>
        </div>
      </div>
      {/* API Key 在 App 层统一配置，ReviewForm 不再展示 */}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">设计需求（系统提示）</label>
          <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">设计规范（系统提示）</label>
          <textarea value={specs} onChange={(e) => setSpecs(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" />
        </div>
      </div>

      {/* 文件上传已在上方显示，避免重复显示 */}

      <div className="grid grid-cols-1 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">问题确认（模型反馈）</label>
          <textarea ref={questionRef} value={questionConfirm} readOnly className="mt-1 block w-full rounded-md border px-3 py-2 bg-gray-50 dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" placeholder="模型返回的问题或疑问将显示在此" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">对话（与模型交互）</label>
          <textarea ref={dialogRef} value={dialog} onChange={(e) => setDialog(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" placeholder="输入与大模型的对话/问题" />
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {/* 会话进度与计时显示 */}
      <div className="flex items-center space-x-4">
        <div className="text-sm text-gray-600 dark:text-gray-300">当前步骤：{STEP_LABELS[progressStep] || progressStep}</div>
        <div className="text-sm text-gray-600 dark:text-gray-300">已用时：{Math.floor(elapsedMs/1000)}s</div>
      </div>

      <div className="flex items-center space-x-2">
        <button type="submit" className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md disabled:opacity-60" disabled={loading}>
          {loading ? '提交中...' : '提交'}
        </button>
        <button type="button" className="px-4 py-2 bg-gray-200 dark:bg-cursorPanel dark:text-cursorText rounded-md" onClick={() => { setDialog(''); setQuestionConfirm('') }}>
          清除对话
        </button>
      </div>
    </form>
  )
}


