import React, { useState, useEffect, useRef } from 'react'
import FileUpload from './FileUpload'
import type { SessionSeed } from '../types/session'
import ReactMarkdown from 'react-markdown'
import { useI18n } from '../i18n'

export default function ReviewForm({
  onResult,
  setEnrichedJson,
  setOverlay,
  overlay,
  modelApiUrl,
  customApiUrl,
  model,
  customModelName,
  setCustomModelName,
  apiKey,
  allowedApiUrls,
  onSavePair,
  markdown,
  sessionSeed,
}: {
  onResult: (markdown: string) => void
  setEnrichedJson?: (j: any) => void
  setOverlay?: (o: any) => void
  overlay?: any
  modelApiUrl: string
  customApiUrl: string
  model: string
  customModelName: string
  setCustomModelName: (v: string) => void
  apiKey: string
  allowedApiUrls: string[]
  onSavePair?: (api: string, model: string) => void
  markdown?: string
  sessionSeed?: SessionSeed
}) {
  const { t, lang } = useI18n() as any
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
  // 用于中止当前正在进行的 fetch 请求
  const controllerRef = useRef<AbortController | null>(null)
  // 中文注释：通过 t() 获取步骤名称，避免硬编码
  function stepLabel(code: string): string {
    return t(`step_${code}`)
  }
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState('')
  const [questionConfirm, setQuestionConfirm] = useState('')
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [localEnrichedJson, setLocalEnrichedJson] = useState<any | null>(null)
  const [saving, setSaving] = useState<boolean>(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false)
  const isHydratingRef = useRef<boolean>(false)
  const [noSystemPromptWarning, setNoSystemPromptWarning] = useState<boolean>(false)

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

  // 中文注释：当收到外部会话种子时，回填至本地状态（包括文件重建与 enrichedJson）
  useEffect(() => {
    async function hydrateFromSeed(seed?: SessionSeed) {
      if (!seed) return
      try {
        isHydratingRef.current = true
        setRequirements(seed.requirements || '无')
        setSpecs(seed.specs || '无')
        setQuestionConfirm(seed.questionConfirm || '')
        setDialog(seed.dialog || '')
        // 将保存的 questionConfirm 作为兜底补齐到 history（若历史中缺少“问题确认/Clarifying Question”项）
        try {
          const qcText = (seed.questionConfirm || '').trim()
          const baseHistory = Array.isArray(seed.history) ? [...seed.history] : []
          const hasQcInHistory = baseHistory.some((h) => h && h.role === 'assistant' && typeof h.content === 'string' && (h.content.includes('【问题确认】') || h.content.includes('【Clarifying Question】') || (qcText && h.content.trim() === qcText)))
          if (!hasQcInHistory && qcText) {
            baseHistory.push({ role: 'assistant', content: qcText })
          }
          setHistory(baseHistory)
        } catch {
          setHistory(Array.isArray(seed.history) ? seed.history : [])
        }
        // enrichedJson 回填
        if (seed.enrichedJson) setLocalEnrichedJson(seed.enrichedJson)
        // 文件重建：base64 -> Blob -> File
        if (Array.isArray(seed.files) && seed.files.length > 0) {
          const rebuilt: File[] = []
          for (const f of seed.files) {
            try {
              const b64 = (f.dataBase64 || '').split(',').pop() || ''
              const binStr = atob(b64)
              const len = binStr.length
              const bytes = new Uint8Array(len)
              for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i)
              const blob = new Blob([bytes], { type: f.type || 'application/octet-stream' })
              const file = new File([blob], f.name || 'file', { type: f.type, lastModified: f.lastModified || Date.now() })
              rebuilt.push(file)
            } catch (e) {
              // 单个文件失败不影响整体
            }
          }
          setFiles(rebuilt)
        } else {
          setFiles([])
        }
        // 加载历史会话后，默认视为“无未保存更改”
        setHasUnsavedChanges(false)
      } catch (e) {
        // 忽略种子异常
      } finally {
        isHydratingRef.current = false
      }
    }
    hydrateFromSeed(sessionSeed)
    // 仅在 sessionSeed 变化时回填
  }, [sessionSeed])

  // 中文注释：监听关键字段变化，标记为“有未保存更改”（在加载期不触发）
  useEffect(() => {
    if (isHydratingRef.current) return
    setHasUnsavedChanges(true)
  }, [requirements, specs, questionConfirm, dialog, history, files, localEnrichedJson, markdown, overlay])

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
      // 中文注释：在发送前仅创建“提交快照”，不立即改动界面；等待上游返回后再入历史与翻页
      const dialogTrimmed = (dialog || '').trim()
      const submittedDialog = dialogTrimmed
      const historySnapshot = submittedDialog ? history.concat([{ role: 'user' as const, content: submittedDialog }]) : history

      const fd = new FormData()
      // fetch latest system prompt from backend and prepend to prompts
      try {
        const spRes = await fetch(`/api/system-prompt?lang=${encodeURIComponent(lang)}`)
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
        } else {
          // 未找到对应语言的系统提示词：设置警告，但不阻断提交
          setNoSystemPromptWarning(true)
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
        setApiUrlError(t('form.customApi.warning'))
      } else {
        setApiUrlError(null)
      }
      fd.append('model', modelClean)
      // send the chosen model api url with the key expected by backend
      fd.append('apiUrl', apiUrlClean)
      fd.append('requirements', requirements)
      fd.append('specs', specs)
      // systemPrompts may already be appended above when fetched
      // include conversation history（已包含本轮用户输入）
      try {
        if (historySnapshot.length > 0) fd.append('history', JSON.stringify(historySnapshot))
      } catch (e) {}
      // dialog content is used to interact with the large model (also sent as last history entry)
      fd.append('dialog', submittedDialog)

      const headers: Record<string, string> = {}
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

      // Always post to the backend endpoint; backend will forward to the external model at modelApiUrl
      setProgressStep('sending_request')
      const controller = new AbortController()
      // 保存 controller 以便外部中止
      controllerRef.current = controller
      // 客户端等待后端响应的超时（毫秒），可通过 Vite 环境变量 VITE_CLIENT_TIMEOUT_MS 配置，默认 1800000（30 分钟）
      // 在浏览器中不可直接访问 process.env，使用 import.meta.env（由 Vite 在构建时注入）
      const timeoutMs = Number((import.meta as any).env.VITE_CLIENT_TIMEOUT_MS || 1800000)
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
      let res: Response
      try {
        res = await fetch(apiUrl, { method: 'POST', body: fd, headers, signal: controller.signal })
      } finally {
        clearTimeout(timeoutId)
        // 请求结束后清理 controllerRef
        controllerRef.current = null
      }
      if (!res.ok) {
        const contentType = res.headers.get('content-type') || ''
        if (res.status === 422 && contentType.includes('application/json')) {
          const j = await res.json()
          // 中文注释：低置信/冲突场景——仍然消费 enrichedJson/overlay 并提示人工复核
          try {
            if (j.enrichedJson) {
              const parsed = (typeof j.enrichedJson === 'string') ? JSON.parse(j.enrichedJson) : j.enrichedJson
              setLocalEnrichedJson(parsed)
              if (typeof setEnrichedJson === 'function') setEnrichedJson(parsed)
            }
            if (j.overlay && typeof setOverlay === 'function') setOverlay(j.overlay)
            // 将 warnings 转化为问题确认前置文案
            const warn = Array.isArray(j.warnings) ? j.warnings.join(', ') : String(j.warnings || '')
            setError(t('form.warning.lowConfidence') + (warn ? `: ${warn}` : ''))
          } catch (e) {}
          // 继续向下走 Markdown 展示逻辑（若包含）
        } else {
          const txt = await res.text()
          throw new Error(txt || `Status ${res.status}`)
        }
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
        // UI 侧：根据时间线提示多阶段进度（若可用）
        try {
          const steps: string[] = (j.timeline || []).map((x: any) => x.step)
          // 尝试将阶段线性映射为用户可读标记
          if (steps.includes('images_processing_start')) setProgressStep('images_processing_start')
          if (steps.includes('images_processing_done')) setProgressStep('images_processing_done')
          if (steps.includes('datasheets_fetch_done')) setProgressStep('datasheets_fetch_done')
          if (steps.includes('second_stage_analysis_start')) setProgressStep('second_stage_analysis_start')
          if (steps.includes('second_stage_analysis_done')) setProgressStep('second_stage_analysis_done')
        } catch {}
      } else {
        md = await res.text()
      }

      // 显示逻辑容错：
      // 1) 若包含中英文“评审报告/Review Report”标记，按原逻辑分割展示
      // 2) 若不包含且文本以中英文“问题确认/Clarifying Question”为主，则仅展示到“问题确认”区
      // 3) 若不包含且非“问题确认”文本，则将全文作为评审结果展示
      const markersReport = ['【评审报告】', '【Review Report】']
      const marker = markersReport.find(m => md.includes(m)) || '【评审报告】'
      const idx = md.indexOf(marker)
      const hasReport = idx >= 0
      const questionParts: string[] = []
      if (qFromJson) questionParts.push(typeof qFromJson === 'string' ? qFromJson : JSON.stringify(qFromJson, null, 2))

      if (hasReport) {
        const reportPart = md.slice(idx)
        const otherPart = md.slice(0, idx)
        if (otherPart && otherPart.trim()) questionParts.push(otherPart.trim())
        const qcText = questionParts.length > 0 ? questionParts.join('\n\n') : ''
        if (qcText) setQuestionConfirm(qcText)
        // 多轮记录：同时把问题确认与评审报告分别记入历史，便于分页查看
        const newEntries: { role: 'user' | 'assistant'; content: string }[] = []
        if (submittedDialog) newEntries.push({ role: 'user', content: submittedDialog })
        if (qcText) newEntries.push({ role: 'assistant', content: qcText })
        if (reportPart && reportPart.trim()) newEntries.push({ role: 'assistant', content: reportPart.trim() })
        if (newEntries.length > 0) setHistory((h) => h.concat(newEntries))
        // 若用户未改动输入，则清空输入框，准备下一轮
        if (submittedDialog && (dialog || '').trim() === submittedDialog) setDialog('')
        if (reportPart && reportPart.trim()) onResult(reportPart.trim())
      } else {
        const looksLikeQuestion = /^(\s*【问题确认】|\s*【Clarifying Question】)/.test(md) || md.includes('【问题确认】') || md.includes('【Clarifying Question】')
        if (looksLikeQuestion) {
          const qText = md && md.trim() ? md.trim() : ''
          const combined = questionParts.concat(qText ? [qText] : [])
          const qcText = combined.length > 0 ? combined.join('\n\n') : ''
          if (qcText) setQuestionConfirm(qcText)
          // 不展示结果视图，等待用户补充信息后再提交
          // 同样记录本轮 user 与 assistant（问题确认）到 history
          const entries: { role: 'user' | 'assistant'; content: string }[] = []
          if (submittedDialog) entries.push({ role: 'user', content: submittedDialog })
          if (qcText) entries.push({ role: 'assistant', content: qcText })
          if (entries.length > 0) setHistory((h) => h.concat(entries))
          if (submittedDialog && (dialog || '').trim() === submittedDialog) setDialog('')
        } else {
          // 将全文作为评审结果展示
          if (questionParts.length > 0) setQuestionConfirm(questionParts.join('\n\n'))
          if (md && md.trim()) {
            onResult(md.trim())
            const entries: { role: 'user' | 'assistant'; content: string }[] = []
            if (submittedDialog) entries.push({ role: 'user', content: submittedDialog })
            entries.push({ role: 'assistant', content: md.trim() })
            setHistory((h) => h.concat(entries))
            if (submittedDialog && (dialog || '').trim() === submittedDialog) setDialog('')
          }
        }
      }
    } catch (err: any) {
      const msg = err?.message || ''
      if (err?.name === 'AbortError' || /aborted/i.test(msg)) {
        setError(t('form.error.timeout'))
      } else {
        setError(msg || t('form.error.submitFail'))
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

  // 中文注释：中止当前与大模型的对话请求
  function handleAbort() {
    try {
      if (controllerRef.current) {
        controllerRef.current.abort()
        // 清理 UI 状态
        setLoading(false)
        setProgressStep('done')
        setError(t('form.error.aborted'))
        if (timerRef.current) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
        controllerRef.current = null
      }
    } catch (e) {
      // 忽略中止异常
    }
  }

  // 中文注释：将 File 转为 base64（data URL）
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // 中文注释：保存当前会话到后端 sessions 目录
  async function handleSaveSession() {
    try {
      setSaving(true)
      // 复用提交时的 apiUrl/model 计算逻辑
      const apiUrlClean = (modelApiUrl === 'custom' ? (customApiUrl || '').trim() : (modelApiUrl || '').trim())
      const isOpenRouterSelected = (apiUrlClean || '').startsWith('https://openrouter.ai')
      const isCustomModelMode = modelApiUrl === 'custom' || isOpenRouterSelected
      const modelClean = (isCustomModelMode ? ((customModelName && customModelName.trim()) ? customModelName.trim() : (model || '').trim()) : (model || '').trim())

      // 文件转 base64
      const filesPayload: { name: string; type: string; size: number; lastModified?: number; dataBase64: string }[] = []
      for (const f of files) {
        try {
          const dataBase64 = await fileToBase64(f)
          filesPayload.push({ name: f.name, type: f.type, size: f.size, lastModified: f.lastModified, dataBase64 })
        } catch (e) {
          // 跳过失败的文件
        }
      }

      const payload = {
        version: 1,
        apiUrl: apiUrlClean,
        model: modelClean,
        customModelName: isCustomModelMode ? (customModelName || undefined) : undefined,
        requirements,
        specs,
        questionConfirm,
        dialog,
        history,
        markdown: markdown || '',
        enrichedJson: localEnrichedJson || undefined,
        overlay: overlay || undefined,
        files: filesPayload,
      }

      const res = await fetch('/api/sessions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())
      // 轻量提示
      alert(t('form.save.ok'))
      setHasUnsavedChanges(false)
    } catch (e: any) {
      alert(t('form.save.fail', { msg: e?.message || '' }))
    } finally {
      setSaving(false)
    }
  }

  // 中文注释：按“页”同步展示问题确认与对话：
  // 第 1 页：问题确认为空，对话为第 1 条用户消息或当前输入
  // 第 n 页 (n>=2)：问题确认为第 n-1 条 assistant 问题确认，对话为第 n 条用户消息（或当前输入）
  // 额外产品规则：
  // - “【阶段性评审】”只展示在右侧评审结果，不应在左侧“问题确认”中显示
  // - 因此在此处对 assistant 消息做过滤：排除包含“【评审报告】”与“【阶段性评审】”的内容
  const assistantQCItems = history
    .filter((h) => h.role === 'assistant' && !/【评审报告】/.test(h.content) && !/【阶段性评审】/.test(h.content) && !/【Review Report】/.test(h.content) && !/【Interim Review】/.test(h.content))
    .map((h) => h.content)
  const userDialogItems = history.filter((h) => h.role === 'user').map((h) => h.content)
  const liveUserCount = userDialogItems.length + ((dialog && dialog.trim()) ? 1 : 0)
  const totalPages = Math.max(liveUserCount, assistantQCItems.length + 1, 1)
  const [page, setPage] = useState<number>(totalPages)
  const isLastPage = page >= totalPages
  useEffect(() => {
    // 当历史或当前输入变化时，自动跳到最后一页
    const p = Math.max(1, Math.max(userDialogItems.length + ((dialog && dialog.trim()) ? 1 : 0), assistantQCItems.length + 1))
    setPage(p)
  }, [history, dialog])

  // 中文注释：页或历史变更时，自动调整两个窗格的高度以适配内容
  useEffect(() => { adjustHeight(questionRef.current) }, [page, history])
  useEffect(() => { adjustHeight(dialogRef.current) }, [page, history, dialog])

  function getQcTextForPage(p: number): string {
    // 当最新一轮问题确认尚未到达，但用户已开始在本轮输入时，第二页仍应显示上一轮问题确认
    if (p <= 1) return ''
    const idx = Math.min(assistantQCItems.length - 1, p - 2)
    if (idx < 0) return ''
    return assistantQCItems[idx] || ''
  }
  function getUserTextForPage(p: number): string {
    // 最后一页始终显示并编辑当前输入 dialog
    if (p >= totalPages) return dialog || ''
    const idx = p - 1
    if (idx < userDialogItems.length) return userDialogItems[idx] || ''
    return ''
  }

  // 中文注释：重置整个选项卡与结果区；如有未保存内容，先询问是否保存
  async function handleResetAll() {
    try {
      if (hasUnsavedChanges) {
        const doSave = window.confirm(t('form.reset.confirm'))
        if (doSave) {
          try { await handleSaveSession() } catch {}
        }
      }
      // 清空父级结果区
      try { onResult('') } catch {}
      try { if (typeof setEnrichedJson === 'function') setEnrichedJson(null) } catch {}
      try { if (typeof setOverlay === 'function') setOverlay(null) } catch {}
      // 清空本地会话数据
      setRequirements('无')
      setSpecs('无')
      setDialog('')
      setQuestionConfirm('')
      setHistory([])
      setFiles([])
      setLocalEnrichedJson(null)
      setError(null)
      setProgressStep('idle')
      setElapsedMs(0)
      setHasUnsavedChanges(false)
      // 重置分页
      try {
        // 置为第一页
        // @ts-ignore - page 在上层作用域
        if (typeof setPage === 'function') setPage(1)
      } catch {}
    } catch (e) {}
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 无系统提示词环境告警（可关闭，不阻断） */}
      {noSystemPromptWarning && (
        <div className="p-2 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-200 flex items-start justify-between gap-2">
          <div>{t('warning.noSystemPrompt')}</div>
          <button type="button" className="text-xs underline" onClick={() => setNoSystemPromptWarning(false)}>{t('common.close')}</button>
        </div>
      )}
      {/* 在 App 中统一渲染模型 API / 模型名称 / API Key，ReviewForm 中仅保留文件上传与提示 */}
      <div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('form.upload.label')}</label>
          <div className="mt-2">
            <FileUpload files={files} onChange={setFiles} />
          </div>
        </div>
      </div>
      {/* API Key 在 App 层统一配置，ReviewForm 不再展示 */}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('form.req.label')}</label>
          <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('form.spec.label')}</label>
          <textarea value={specs} onChange={(e) => setSpecs(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" />
        </div>
      </div>

      {/* 文件上传已在上方显示，避免重复显示 */}

      <div className="grid grid-cols-1 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('form.qc.label')}</label>
          <textarea
            ref={questionRef}
            readOnly
            value={getQcTextForPage(page)}
            className="mt-1 block w-full rounded-md border px-3 py-2 bg-gray-50 dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText min-h-[120px]"
            placeholder={t('form.qc.placeholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('form.dialog.label')}</label>
          <textarea
            ref={dialogRef}
            value={getUserTextForPage(page)}
            onFocus={() => { if (!isLastPage) setPage(totalPages) }}
            onChange={(e) => setDialog(e.target.value)}
            readOnly={!isLastPage}
            className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText"
            placeholder={isLastPage ? t('form.dialog.placeholder.editable') : t('form.dialog.placeholder.readonly')}
          />
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">{t('form.paging.current', { page, total: totalPages })}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <button type="button" className="px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('form.paging.prev')}</button>
            <button type="button" className="px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{t('form.paging.next')}</button>
          </div>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {/* 会话进度与计时显示 */}
      <div className="flex items-center space-x-4">
        <div className="text-sm text-gray-600 dark:text-gray-300">{t('form.progress.current', { step: stepLabel(progressStep) || progressStep })}</div>
        <div className="text-sm text-gray-600 dark:text-gray-300">{t('form.progress.elapsed', { seconds: Math.floor(elapsedMs/1000) })}</div>
      </div>
      {/* 若可用，显示阶段提示 */}
      <div className="text-xs text-gray-500 dark:text-gray-300">
        {progressStep === 'images_processing_start' && t('progress.images_processing_start')}
        {progressStep === 'images_processing_done' && t('progress.images_processing_done')}
        {progressStep === 'datasheets_fetch_done' && t('progress.datasheets_fetch_done')}
        {progressStep === 'second_stage_analysis_start' && t('progress.second_stage_analysis_start')}
        {progressStep === 'second_stage_analysis_done' && t('progress.second_stage_analysis_done')}
      </div>

      <div className="flex items-center space-x-2">
        <button type="submit" className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md disabled:opacity-60" disabled={loading}>
          {loading ? t('form.submit.loading') : t('form.submit')}
        </button>
        <button type="button" className="px-4 py-2 bg-white border dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder rounded-md transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500" onClick={handleAbort} disabled={!controllerRef.current}>
          {t('form.abort')}
        </button>
        <button type="button" className="px-4 py-2 bg-white border dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder rounded-md transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" onClick={handleResetAll}>
          {t('form.reset')}
        </button>
        <button type="button" className="px-4 py-2 bg-white dark:bg-cursorPanel dark:text-cursorText border dark:border-cursorBorder rounded-md disabled:opacity-60" onClick={handleSaveSession} disabled={saving}>
          {saving ? t('form.save.loading') : t('form.save')}
        </button>
      </div>
    </form>
  )
}


