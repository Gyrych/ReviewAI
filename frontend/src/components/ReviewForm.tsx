import React, { useState, useEffect, useRef } from 'react'
import FileUpload from './FileUpload'
import type { SessionSeed } from '../types/session'
import ReactMarkdown from 'react-markdown'
import { useI18n } from '../i18n'

export default function ReviewForm({
  onResult,
  // 新增：当后端返回 timeline 时，回调父组件以便统一展示
  onTimeline,
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
  onTimeline?: (timeline: { step: string; ts?: number; meta?: any }[]) => void
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
  // 中文注释：记录与大模型交互的步骤时间线（用于展示历史步骤）
  const [timeline, setTimeline] = useState<{ step: string; ts?: number; meta?: any }[]>([])
  // 控制哪些后端 timeline 项被展开以显示详情
  const [expandedTimelineItems, setExpandedTimelineItems] = useState<Record<string, boolean>>({})
  const [localEnrichedJson, setLocalEnrichedJson] = useState<any | null>(null)
  const [saving, setSaving] = useState<boolean>(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false)
  const isHydratingRef = useRef<boolean>(false)
  const [noSystemPromptWarning, setNoSystemPromptWarning] = useState<boolean>(false)
  // 多轮识别和搜索配置
  const [multiPassRecognition, setMultiPassRecognition] = useState<boolean>(false)
  const [recognitionPasses, setRecognitionPasses] = useState<number>(5)
  const [enableSearch, setEnableSearch] = useState<boolean>(true)
  const [searchTopN, setSearchTopN] = useState<number>(5)

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
        // 将保存的 questionConfirm 作为兜底补齐到 history（若历史中缺少"问题确认/Clarifying Question"项）
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
        // 回填 timeline（若存在）
        try {
          const loadedTimeline = Array.isArray((seed as any).timeline) ? [...(seed as any).timeline] : []
          setTimeline(loadedTimeline)

          // 根据加载的 timeline 恢复进度状态
          if (loadedTimeline.length > 0) {
            // 设置当前进度步骤为最后一个步骤
            const lastStep = loadedTimeline[loadedTimeline.length - 1]
            setProgressStep(lastStep.step)

            // 计算总耗时（从第一个步骤到最后一个步骤）
            try {
              const firstStep = loadedTimeline[0]
              if (firstStep.ts && lastStep.ts) {
                const totalElapsed = Math.max(0, lastStep.ts - firstStep.ts)
                setElapsedMs(totalElapsed)
              }
            } catch (e) {
              // 忽略时间计算错误
            }
          }

          // 停止任何正在运行的计时器，因为这是已保存的会话
          if (timerRef.current) {
            window.clearInterval(timerRef.current)
            timerRef.current = null
          }
        } catch {}
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
        // 加载历史会话后，默认视为"无未保存更改"
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

  // 中文注释：监听关键字段变化，标记为"有未保存更改"（在加载期不触发）
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
      // 在提交流程开始时记录 timeline 条目
      setTimeline((t) => t.concat([{ step: 'preparing', ts: Date.now() }]))
      // 中文注释：在发送前仅创建"提交快照"，不立即改动界面；等待上游返回后再入历史与翻页
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
        setTimeline((t) => t.concat([{ step: 'uploading_files', ts: Date.now() }]))
        files.forEach((f) => fd.append('files', f))
      } else {
        // 将已生成的图片描述（结构化 JSON）随表单一并发送，便于后端复用而非二次识别
        setProgressStep('using_cached_enriched_json')
        setTimeline((t) => t.concat([{ step: 'using_cached_enriched_json', ts: Date.now() }]))
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

      // 添加多轮识别和搜索配置参数
      fd.append('multiPassRecognition', multiPassRecognition.toString())
      if (multiPassRecognition) {
        fd.append('recognitionPasses', recognitionPasses.toString())
      }
      fd.append('enableSearch', enableSearch.toString())
      if (enableSearch) {
        fd.append('searchTopN', searchTopN.toString())
      }
      fd.append('saveEnriched', 'true')

      const headers: Record<string, string> = {}
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

      // Always post to the backend endpoint; backend will forward to the external model at modelApiUrl
      setProgressStep('sending_request')
      setTimeline((t) => t.concat([{ step: 'sending_request', ts: Date.now() }]))
      const controller = new AbortController()
      // 保存 controller 以便外部中止
      controllerRef.current = controller
      // 客户端等待后端响应的超时（毫秒），可通过 Vite 环境变量 VITE_CLIENT_TIMEOUT_MS 配置，默认 7200000（2 小时）
      // 在浏览器中不可直接访问 process.env，使用 import.meta.env（由 Vite 在构建时注入）
      const timeoutMs = Number((import.meta as any).env.VITE_CLIENT_TIMEOUT_MS || 7200000)
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
          // 合并后端返回的 timeline 到本地 timeline（保留本地已有条目）
          try {
            const remote: any[] = peek.timeline || []
            const normalized = remote.map((x) => ({ step: x.step, ts: x.ts, meta: x.meta || x }))
            // 先合并到本地视图
            setTimeline((t) => t.concat(normalized))
            // 再通过回调通知父组件（例如 App）以更新全局/结果区 timeline
            try { if (typeof onTimeline === 'function') onTimeline(normalized) } catch (e) { /* ignore parent callback errors */ }
          } catch {}
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
        // 大模型返回内容会在后续的 analysis_result / clarifying_question 条目中包含 fullResponse，
        // 因此此处无需额外插入独立的 llm_response 步骤，避免重复展示。
        // UI 侧：根据时间线提示多阶段进度（若可用）
        try {
          // 若后端返回 timeline，将其合并并尝试映射用户可读进度
          if (Array.isArray(j.timeline)) {
            const remote = j.timeline.map((x: any) => ({ step: x.step, ts: x.ts, meta: x.meta || x }))
            setTimeline((t) => t.concat(remote))
          }
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
      // 1) 若包含中英文"评审报告/Review Report"标记，按原逻辑分割展示
      // 2) 若不包含且文本以中英文"问题确认/Clarifying Question"为主，则仅展示到"问题确认"区
      // 3) 若不包含且非"问题确认"文本，则将全文作为评审结果展示
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
        // 记录 timeline 中的结果节点，包含大模型返回的具体内容
        setTimeline((t) => t.concat([{
          step: 'analysis_result',
          ts: Date.now(),
          meta: {
            report: !!reportPart,
            llmResponse: {
              clarifyingQuestions: qcText,
              reviewReport: reportPart?.trim(),
              fullResponse: md
            }
          }
        }]))
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
          setTimeline((t) => t.concat([{
            step: 'clarifying_question',
            ts: Date.now(),
            meta: {
              llmResponse: {
                clarifyingQuestions: qcText,
                fullResponse: md
              }
            }
          }]))
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
            setTimeline((t) => t.concat([{
              step: 'analysis_result',
              ts: Date.now(),
              meta: {
                llmResponse: {
                  fullResponse: md.trim()
                }
              }
            }]))
            if (submittedDialog && (dialog || '').trim() === submittedDialog) setDialog('')
          }
        }
      }
    } catch (err: any) {
      const msg = err?.message || ''
      if (err?.name === 'AbortError' || /aborted/i.test(msg)) {
        setError(t('form.error.timeout'))
        setTimeline((t) => t.concat([{ step: 'aborted', ts: Date.now() }]))
      } else {
        setError(msg || t('form.error.submitFail'))
      }
    } finally {
      setLoading(false)
      setProgressStep('done')
      setTimeline((t) => t.concat([{ step: 'done', ts: Date.now() }]))
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  // 当本地 timeline 发生变化时，推送给父组件用于全局结果区展示
  useEffect(() => {
    try {
      if (typeof onTimeline === 'function') onTimeline(Array.isArray(timeline) ? [...timeline] : [])
    } catch (e) {
      // 忽略父组件回调异常
    }
  }, [timeline])

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
        // 将本地 timeline 一并持久化（若有）
        timeline: timeline.length > 0 ? timeline : undefined,
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

  // 中文注释：按"页"同步展示问题确认与对话：
  // 第 1 页：问题确认为空，对话为第 1 条用户消息或当前输入
  // 第 n 页 (n>=2)：问题确认为第 n-1 条 assistant 问题确认，对话为第 n 条用户消息（或当前输入）
  // 额外产品规则：
  // - "【阶段性评审】"只展示在右侧评审结果，不应在左侧"问题确认"中显示
  // - 因此在此处对 assistant 消息做过滤：排除包含"【评审报告】"与"【阶段性评审】"的内容
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

  // 格式化时间戳为相对时间短文本（例如：刚刚、5s、2m、HH:MM）
  function formatRelative(ts?: number): string {
    if (!ts) return ''
    try {
      const delta = Math.floor((Date.now() - ts) / 1000)
      if (delta < 5) return '刚刚'
      if (delta < 60) return `${delta}s`
      if (delta < 3600) return `${Math.floor(delta / 60)}m`
      const d = new Date(ts)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `${hh}:${mm}`
    } catch (e) { return '' }
  }

  // 格式化为本地日期时间（用于显示每步的具体时间）
  function formatAbsolute(ts?: number): string {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      return d.toLocaleString()
    } catch (e) { return '' }
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
      setTimeline([])
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

      {/* 多轮识别和搜索配置 */}
      <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">{t('form.advanced.label')}</div>
        <div className="space-y-3">
          {/* 多轮识别配置 */}
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={multiPassRecognition}
                onChange={(e) => setMultiPassRecognition(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">{t('form.multiPass.enable')}</span>
            </label>
            {multiPassRecognition && (
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('form.multiPass.passes')}:</label>
                <select
                  value={recognitionPasses}
                  onChange={(e) => setRecognitionPasses(Number(e.target.value))}
                  className="text-sm border rounded px-2 py-1 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                >
                  {[3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 搜索配置 */}
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={enableSearch}
                onChange={(e) => setEnableSearch(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">{t('form.search.enable')}</span>
            </label>
            {enableSearch && (
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">{t('form.search.topN')}:</label>
                <select
                  value={searchTopN}
                  onChange={(e) => setSearchTopN(Number(e.target.value))}
                  className="text-sm border rounded px-2 py-1 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                >
                  {[3, 5, 10, 15, 20].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

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
            className="mt-1 block w-full rounded-md border px-3 py-2 bg-gray-50 dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText thin-gray-scroll resize-none overflow-hidden"
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

      {/* 会话进度显示（保留 elapsed） */}
      <div className="mb-2">
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
      {/* 将时间线放到按钮下方 */}
      <div className="mt-3 text-xs text-gray-500 dark:text-gray-300">
        <div className="font-medium text-gray-700 dark:text-gray-200">{t('timeline.label') || '步骤历史'}</div>
        <div className="mt-1 space-y-2">
          {(() => {
            // 显示所有步骤，包括前端和后端步骤
            const allTimeline = timeline || []
            if (!allTimeline || allTimeline.length === 0) return <div className="text-xs text-gray-400">{t('step_idle')}</div>

            // 为前端步骤添加更详细的元数据
            const enhancedTimeline = allTimeline.map((item, index) => {
              const enhancedItem = { ...item }

              // 分类步骤类型
              function getStepType(step: string): { type: string; modelType?: string; description: string } {
                const aiSteps = {
                  'images_processing_start': { type: 'ai_interaction', modelType: 'vision', description: '调用视觉模型解析图片' },
                  'images_processing_done': { type: 'ai_interaction', modelType: 'vision', description: '视觉模型解析完成' },
                  'multi_pass_recognition_start': { type: 'ai_interaction', modelType: 'vision', description: '开始多轮视觉识别' },
                  'multi_pass_recognition_done': { type: 'ai_interaction', modelType: 'vision', description: '多轮视觉识别完成' },
                  'recognition_consolidation_start': { type: 'ai_interaction', modelType: 'llm', description: '开始结果整合' },
                  'recognition_consolidation_done': { type: 'ai_interaction', modelType: 'llm', description: '结果整合完成' },
                  'recognition_consolidation_fallback': { type: 'ai_interaction', modelType: 'vision', description: '结果整合回退' },
                  'second_stage_analysis_start': { type: 'ai_interaction', modelType: 'llm', description: '调用大语言模型分析' },
                  'second_stage_analysis_done': { type: 'ai_interaction', modelType: 'llm', description: '大语言模型分析完成' }
                }

                if (aiSteps[step as keyof typeof aiSteps]) {
                  return aiSteps[step as keyof typeof aiSteps]
                }

                // 前端步骤
                if (['preparing', 'uploading_files', 'using_cached_enriched_json', 'sending_request', 'done'].includes(step)) {
                  return { type: 'frontend', description: '前端操作' }
                }

                // 后端辅助步骤
                if (['request_received', 'datasheets_fetch_done', 'images_processing_skipped'].includes(step)) {
                  return { type: 'backend', description: '后端处理' }
                }

                // 错误步骤
                if (['aborted'].includes(step)) {
                  return { type: 'error', description: '操作异常' }
                }

                return { type: 'unknown', description: '未知步骤' }
              }

              const stepInfo = getStepType(item.step)

              // 为前端对话步骤添加内容
              if (item.step === 'preparing') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  action: t('step_preparing'),
                  description: stepInfo.description,
                  files: files.map(f => ({ name: f.name, size: f.size, type: f.type }))
                }
              } else if (item.step === 'uploading_files') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  action: t('step_uploading_files'),
                  description: stepInfo.description,
                  files: files.map(f => ({ name: f.name, size: f.size, type: f.type }))
                }
              } else if (item.step === 'using_cached_enriched_json') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  action: t('step_using_cached_enriched_json'),
                  description: stepInfo.description,
                  cachedData: localEnrichedJson ? '包含已解析的图片结构化数据' : '无缓存数据'
                }
              } else if (item.step === 'sending_request') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  action: t('step_sending_request'),
                  description: stepInfo.description,
                  requestData: {
                    apiUrl: modelApiUrl,
                    model: model,
                    hasSystemPrompt: !!(requirements || specs),
                    hasFiles: files.length > 0,
                    hasDialog: !!(dialog || '').trim()
                  }
                }
              } else if (item.step === 'images_processing_start') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: '开始调用视觉模型',
                  description: stepInfo.description,
                  visionRequest: {
                    fileCount: files.length,
                    apiUrl: modelApiUrl,
                    model: model
                  }
                }
              } else if (item.step === 'multi_pass_recognition_start') {
                const meta = item.meta || {}
                enhancedItem.meta = {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: '开始多轮视觉识别',
                  description: stepInfo.description,
                  totalPasses: meta.totalPasses,
                  multiPassInfo: `将对图片进行${meta.totalPasses}轮独立识别，提高识别准确性`
                }
              } else if (item.step === 'multi_pass_recognition_done') {
                const meta = item.meta || {}
                enhancedItem.meta = {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: '多轮视觉识别完成',
                  description: stepInfo.description,
                  totalPasses: meta.totalPasses,
                  successfulPasses: meta.successfulPasses,
                  totalProcessingTime: meta.totalProcessingTime,
                  averageTimePerPass: meta.averageTimePerPass,
                  multiPassResult: `${meta.successfulPasses}/${meta.totalPasses}轮识别成功，总耗时${meta.totalProcessingTime}ms`
                }
              } else if (item.step === 'recognition_consolidation_start') {
                const meta = item.meta || {}
                enhancedItem.meta = {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: '开始结果整合',
                  description: stepInfo.description,
                  resultCount: meta.resultCount,
                  consolidationInfo: `使用大模型整合${meta.resultCount}个识别结果，生成最准确的最终结果`
                }
              } else if (item.step === 'recognition_consolidation_done') {
                const meta = item.meta || {}
                enhancedItem.meta = {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: '结果整合完成',
                  description: stepInfo.description,
                  resultCount: meta.resultCount,
                  consolidatedComponents: meta.consolidatedComponents,
                  consolidatedConnections: meta.consolidatedConnections,
                  consolidationResult: `成功整合${meta.resultCount}个结果，最终生成${meta.consolidatedComponents}个器件和${meta.consolidatedConnections}条连接`
                }
              } else if (item.step === 'recognition_consolidation_fallback') {
                const meta = item.meta || {}
                enhancedItem.meta = {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: '结果整合回退',
                  description: stepInfo.description,
                  resultCount: meta.resultCount,
                  fallbackComponents: meta.fallbackComponents,
                  fallbackConnections: meta.fallbackConnections,
                  consolidationFallback: `整合失败，使用最佳单轮结果：${meta.fallbackComponents}个器件，${meta.fallbackConnections}条连接`
                }
              } else if (item.step === 'images_processing_done') {
                const visionResult = item.meta?.visionResult
                if (visionResult) {
                  enhancedItem.meta = {
                    type: stepInfo.type,
                    modelType: stepInfo.modelType,
                    action: '视觉模型解析完成',
                    description: stepInfo.description,
                    content: item.meta?.summary || '包含结构化描述',
                    visionResult: visionResult,
                    visionResponse: '结构化JSON数据包含器件、连接和网络信息'
                  }
                } else {
                  enhancedItem.meta = { type: stepInfo.type, action: '图片处理完成' }
                }
              } else if (item.step === 'datasheets_fetch_done') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  action: 'IC器件资料下载完成',
                  description: stepInfo.description,
                  datasheetCount: item.meta?.datasheetCount || 0,
                  downloadedCount: item.meta?.downloadedCount || 0,
                  datasheets: item.meta?.datasheets || []
                }
              } else if (item.step === 'second_stage_analysis_start') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: '开始调用大语言模型',
                  description: stepInfo.description,
                  analysisRequest: {
                    hasCircuitData: !!localEnrichedJson,
                    hasRequirements: !!(requirements || '').trim(),
                    hasSpecs: !!(specs || '').trim(),
                    hasHistory: history.length > 0,
                    apiUrl: modelApiUrl,
                    model: model
                  }
                }
              } else if (item.step === 'second_stage_analysis_done') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: '大语言模型分析完成',
                  description: stepInfo.description,
                  analysisComplete: true
                }
              } else if (item.step === 'analysis_result') {
                const llmResponse = item.meta?.llmResponse
                enhancedItem.meta = {
                  type: 'llm_response',
                  modelType: 'llm',
                  action: t('step_analysis_result'),
                  content: llmResponse?.reviewReport ? t('timeline.reviewReport') : (llmResponse?.clarifyingQuestions ? t('timeline.clarifyingQuestions') : t('step_done')),
                  llmResponse: llmResponse
                }
              } else if (item.step === 'clarifying_question') {
                const llmResponse = item.meta?.llmResponse
                enhancedItem.meta = {
                  type: 'llm_response',
                  modelType: 'llm',
                  action: t('step_clarifying_question'),
                  content: t('timeline.clarifyingQuestions'),
                  llmResponse: llmResponse
                }
              } else if (item.step === 'aborted') {
                enhancedItem.meta = { type: stepInfo.type, action: t('step_aborted') }
              } else if (item.step === 'done') {
                enhancedItem.meta = { type: stepInfo.type, action: t('step_done') }
              } else if (item.step === 'request_received') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  action: '请求已接收',
                  description: stepInfo.description
                }
              }

              return enhancedItem
            })

            return enhancedTimeline.slice().reverse().map((it, idx) => {
              const step = it.step || ''
              // 更新分组逻辑
              let groupKey = 'timeline.group.other'
              if (/images_processing/i.test(step)) groupKey = 'timeline.group.vision'
              else if (/datasheets_fetch|search|fetch/i.test(step)) groupKey = 'timeline.group.search'
              else if (/second_stage_analysis/i.test(step)) groupKey = 'timeline.group.llm'
              else if (/request|sending|llm_request|request_received/i.test(step)) groupKey = 'timeline.group.request'
              else if (/preparing|uploading|using_cached|aborted|done/i.test(step)) groupKey = 'timeline.group.frontend'
              else if (/analysis|clarifying_question/i.test(step)) groupKey = 'timeline.group.response'

              const isCurrent = progressStep && (step === progressStep || step.includes(progressStep))
              const isError = /aborted|error|fail/i.test(step)
              const isAIInteraction = it.meta?.type === 'ai_interaction'
              const isVisionStep = it.meta?.modelType === 'vision'
              const isLLMStep = it.meta?.modelType === 'llm'
              const isLLMResponse = it.meta?.type === 'llm_response'
              const isVisionResult = it.meta?.type === 'vision_result'
              const key = `${it.step}_${it.ts}_${idx}`
              const expanded = !!expandedTimelineItems[key]

              return (
                <div key={key} className={`border-b border-gray-100 dark:border-cursorBorder ${isCurrent ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''} ${isAIInteraction ? 'bg-purple-50 dark:bg-purple-900/20' : ''} ${isLLMResponse ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${isVisionResult ? 'bg-green-50 dark:bg-green-900/20' : ''}`}>
                  <div className="flex items-start justify-between gap-2 p-1 cursor-pointer" onClick={() => setExpandedTimelineItems((s) => ({ ...s, [key]: !s[key] }))}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm dark:text-gray-200 flex items-center gap-2">
                        <span className={`w-5 h-5 inline-flex items-center justify-center rounded-full text-xs ${isError ? 'text-red-600' : (isAIInteraction ? 'text-purple-600' : (isLLMResponse ? 'text-blue-600' : (isVisionResult ? 'text-green-600' : (isCurrent ? 'text-yellow-600' : 'text-gray-500'))))}`}>
                          {isError ? '✖' : (isAIInteraction ? '🧠' : (isLLMResponse ? '🤖' : (isVisionResult ? '👁️' : (isCurrent ? '●' : '○'))))}
                        </span>
                        <div className="truncate">{stepLabel(it.step) || it.step}</div>
                        {isAIInteraction && (
                          <span className={`text-xs px-1 py-0.5 rounded text-white ${isVisionStep ? 'bg-green-600' : (isLLMStep ? 'bg-blue-600' : 'bg-purple-600')}`}>
                            {isVisionStep ? '视觉' : (isLLMStep ? 'LLM' : 'AI')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                        {t(groupKey)}
                        {it.meta && it.meta.action ? ` · ${it.meta.action}` : ''}
                        {it.meta && it.meta.description ? ` · ${it.meta.description}` : ''}
                        {it.meta && it.meta.content && !isAIInteraction ? ` · ${it.meta.content}` : ''}
                    </div>
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 text-right flex-shrink-0">
                      {formatAbsolute(it.ts)}
                      <div className="text-[10px]">{formatRelative(it.ts)}</div>
                    </div>
                  </div>
                  {expanded && (
                    <div className="p-2 pt-0 text-[12px] text-gray-700 dark:text-gray-300">
                      <div className="text-[11px] text-gray-500 mb-1">{t('timeline.detail')}</div>
                      <div className="space-y-2">
                        <div><strong>步骤：</strong>{stepLabel(it.step) || it.step}</div>
                        <div><strong>时间：</strong>{formatAbsolute(it.ts)}</div>
                        {it.meta && it.meta.type && <div><strong>类型：</strong>{it.meta.type}</div>}
                        {it.meta && it.meta.action && <div><strong>操作：</strong>{it.meta.action}</div>}
                        {it.meta && it.meta.content && <div><strong>内容：</strong>{it.meta.content}</div>}

                        {/* 显示文件上传信息 */}
                        {it.meta && it.meta.files && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                            <div className="text-[11px] text-orange-600 dark:text-orange-400 mb-2 font-medium">📁 {t('timeline.uploadInfo')}</div>
                            <div className="space-y-1 text-xs">
                              <div><strong>{t('timeline.fileCount')}：</strong>{it.meta.files.length}</div>
                              {it.meta.files.map((file: any, idx: number) => (
                                <div key={idx} className="ml-2 text-gray-600 dark:text-gray-400">
                                  • {file.name} ({(file.size / 1024).toFixed(1)} KB, {file.type})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 显示请求信息 */}
                        {it.meta && (it.meta.requestData || it.meta.visionRequest || it.meta.analysisRequest) && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                            <div className="text-[11px] text-purple-600 dark:text-purple-400 mb-2 font-medium">📤 {t('timeline.requestInfo')}</div>
                            <div className="space-y-1 text-xs">
                              {it.meta.requestData && (
                                <>
                                  <div><strong>{t('timeline.apiUrl')}：</strong>{it.meta.requestData.apiUrl}</div>
                                  <div><strong>{t('timeline.model')}：</strong>{it.meta.requestData.model}</div>
                                  <div><strong>{t('timeline.hasSystemPrompt')}：</strong>{it.meta.requestData.hasSystemPrompt ? '是' : '否'}</div>
                                  <div><strong>{t('timeline.hasFiles')}：</strong>{it.meta.requestData.hasFiles ? '是' : '否'}</div>
                                  <div><strong>{t('timeline.hasDialog')}：</strong>{it.meta.requestData.hasDialog ? '是' : '否'}</div>
                                </>
                              )}
                              {it.meta.visionRequest && (
                                <>
                                  <div><strong>{t('timeline.visionModel')}：</strong>{it.meta.visionRequest.model}</div>
                                  <div><strong>{t('timeline.apiUrl')}：</strong>{it.meta.visionRequest.apiUrl}</div>
                                  <div><strong>{t('timeline.processedFiles')}：</strong>{it.meta.visionRequest.fileCount}</div>
                                </>
                              )}
                              {it.meta.analysisRequest && (
                                <>
                                  <div><strong>{t('timeline.languageModel')}：</strong>{it.meta.analysisRequest.model}</div>
                                  <div><strong>{t('timeline.apiUrl')}：</strong>{it.meta.analysisRequest.apiUrl}</div>
                                  <div><strong>{t('timeline.hasCircuitData')}：</strong>{it.meta.analysisRequest.hasCircuitData ? '是' : '否'}</div>
                                  <div><strong>{t('timeline.hasRequirements')}：</strong>{it.meta.analysisRequest.hasRequirements ? '是' : '否'}</div>
                                  <div><strong>{t('timeline.hasSpecs')}：</strong>{it.meta.analysisRequest.hasSpecs ? '是' : '否'}</div>
                                  <div><strong>{t('timeline.hasHistory')}：</strong>{it.meta.analysisRequest.hasHistory ? '是' : '否'}</div>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 显示缓存数据信息 */}
                        {it.meta && it.meta.cachedData && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                            <div className="text-[11px] text-cyan-600 dark:text-cyan-400 mb-2 font-medium">💾 {t('timeline.cachedData')}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {it.meta.cachedData}
                            </div>
                          </div>
                        )}

                        {/* 显示器件资料信息 */}
                        {it.meta && (it.meta.datasheetCount !== undefined || it.meta.datasheets) && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                            <div className="text-[11px] text-indigo-600 dark:text-indigo-400 mb-2 font-medium">📋 {t('timeline.datasheetDetails')}</div>
                            <div className="space-y-2 text-xs">
                              <div className="flex gap-4">
                                <div><strong>{t('timeline.retrievedComponents')}：</strong>{it.meta.datasheetCount || 0}</div>
                                <div><strong>{t('timeline.successfulDownloads')}：</strong>{it.meta.downloadedCount || 0}</div>
                              </div>

                              {it.meta.datasheets && it.meta.datasheets.length > 0 && (
                                <div className="mt-3">
                                  <details className="border rounded border-gray-200 dark:border-gray-600">
                                    <summary className="cursor-pointer p-2 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">
                                      📚 {t('timeline.allDatasheetInfo')} ({it.meta.datasheets.length})
                                    </summary>
                                    <div className="p-2 border-t border-gray-200 dark:border-gray-600 space-y-3 max-h-64 overflow-y-auto thin-gray-scroll">
                                      {it.meta.datasheets.map((sheet: any, idx: number) => (
                                        <div key={idx} className="border rounded border-gray-100 dark:border-gray-700 p-2 bg-white dark:bg-gray-800">
                                          <div className="font-medium text-gray-800 dark:text-gray-200 mb-1">
                                            {sheet.component_name} - {sheet.query_string}
                                          </div>
                                          <div className="grid grid-cols-1 gap-1 text-xs text-gray-600 dark:text-gray-400">
                                            <div><strong>{t('timeline.sourceType')}：</strong>{sheet.source_type}</div>
                                            <div><strong>{t('timeline.documentTitle')}：</strong>{sheet.document_title || t('common.none')}</div>
                                            <div><strong>{t('timeline.sourceUrl')}：</strong>
                                              {sheet.source_url ? (
                                                <a href={sheet.source_url} target="_blank" rel="noopener noreferrer"
                                                   className="text-blue-600 dark:text-blue-400 hover:underline break-all">
                                                  {sheet.source_url}
                                                </a>
                                              ) : t('common.none')}
                                            </div>
                                            <div><strong>{t('timeline.confidence')}：</strong>{(sheet.confidence * 100).toFixed(1)}%</div>
                                            <div><strong>{t('timeline.retrievalTime')}：</strong>{new Date(sheet.retrieved_at).toLocaleString()}</div>
                                            <div><strong>{t('timeline.status')}：</strong>{sheet.notes}</div>

                                            {sheet.candidates && sheet.candidates.length > 1 && (
                                              <details className="mt-2">
                                                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">
                                                  {t('timeline.otherCandidates')} ({sheet.candidates.length - 1})
                                                </summary>
                                                <div className="mt-1 space-y-1 pl-2">
                                                  {sheet.candidates.slice(1).map((candidate: any, cidx: number) => (
                                                    <div key={cidx} className="text-xs">
                                                      <a href={candidate.url} target="_blank" rel="noopener noreferrer"
                                                         className="text-blue-500 dark:text-blue-400 hover:underline break-all">
                                                        {candidate.title}
                                                      </a>
                                                    </div>
                                                  ))}
                                                </div>
                                              </details>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 显示图片解析结果 */}
                        {it.meta && it.meta.visionResult && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                            <div className="text-[11px] text-green-600 dark:text-green-400 mb-2 font-medium">👁️ {t('timeline.visionResult')}</div>
                            <div className="space-y-2 text-xs">
                              {/* 统计信息 */}
                              <div className="grid grid-cols-2 gap-2">
                                <div><strong>{t('timeline.componentsCount')}：</strong>{it.meta.visionResult.componentsCount}</div>
                                <div><strong>{t('timeline.connectionsCount')}：</strong>{it.meta.visionResult.connectionsCount}</div>
                                {it.meta.visionResult.netsCount > 0 && <div><strong>{t('timeline.netsCount')}：</strong>{it.meta.visionResult.netsCount}</div>}
                                {it.meta.visionResult.hasOverlay && <div><strong>{t('timeline.visualization')}：</strong>{t('timeline.hasOverlay')}</div>}
                              </div>
                              {it.meta.visionResult.enrichedComponentsCount > 0 && (
                                <div><strong>{t('timeline.paramEnrichment')}：</strong>{it.meta.visionResult.enrichedComponentsCount} 个器件</div>
                              )}

                              {/* 完整的结构化数据 */}
                              {localEnrichedJson && (
                                <div className="mt-3">
                                  <details className="border rounded border-gray-200 dark:border-gray-600">
                                    <summary className="cursor-pointer p-2 text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">
                                      📋 {t('timeline.fullStructuredDescription')}
                                    </summary>
                                    <div className="p-2 border-t border-gray-200 dark:border-gray-600">
                                      <pre className="text-[10px] overflow-auto max-h-64 bg-gray-50 dark:bg-gray-800 p-2 rounded whitespace-pre-wrap">
                                        {JSON.stringify(localEnrichedJson, null, 2)}
                                      </pre>
                                    </div>
                                  </details>
                                </div>
                              )}

                              {it.meta.visionResponse && (
                                <div className="mt-2">
                                  <strong>{t('timeline.returnContent')}：</strong>
                                  <div className="text-gray-600 dark:text-gray-400 mt-1">{it.meta.visionResponse}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 显示多轮识别信息 */}
                        {it.meta && (it.meta.totalPasses || it.meta.multiPassInfo || it.meta.multiPassResult) && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                            <div className="text-[11px] text-cyan-600 dark:text-cyan-400 mb-2 font-medium">🔄 {t('timeline.multiPassRecognition')}</div>
                            <div className="space-y-2 text-xs">
                              {it.meta.totalPasses && (
                                <div><strong>{t('timeline.totalPasses')}：</strong>{it.meta.totalPasses}</div>
                              )}
                              {it.meta.successfulPasses !== undefined && (
                                <div><strong>{t('timeline.successfulPasses')}：</strong>{it.meta.successfulPasses}</div>
                              )}
                              {it.meta.totalProcessingTime && (
                                <div><strong>{t('timeline.totalProcessingTime')}：</strong>{it.meta.totalProcessingTime}ms</div>
                              )}
                              {it.meta.averageTimePerPass && (
                                <div><strong>{t('timeline.averageTimePerPass')}：</strong>{it.meta.averageTimePerPass}ms</div>
                              )}
                              {it.meta.multiPassInfo && (
                                <div><strong>{t('timeline.multiPassInfo')}：</strong>{it.meta.multiPassInfo}</div>
                              )}
                              {it.meta.multiPassResult && (
                                <div><strong>{t('timeline.multiPassResult')}：</strong>{it.meta.multiPassResult}</div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 显示结果整合信息 */}
                        {it.meta && (it.meta.resultCount || it.meta.consolidationInfo || it.meta.consolidationResult) && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                            <div className="text-[11px] text-indigo-600 dark:text-indigo-400 mb-2 font-medium">🧠 {t('timeline.consolidation')}</div>
                            <div className="space-y-2 text-xs">
                              {it.meta.resultCount && (
                                <div><strong>{t('timeline.resultCount')}：</strong>{it.meta.resultCount}</div>
                              )}
                              {it.meta.consolidatedComponents !== undefined && (
                                <div><strong>{t('timeline.consolidatedComponents')}：</strong>{it.meta.consolidatedComponents}</div>
                              )}
                              {it.meta.consolidatedConnections !== undefined && (
                                <div><strong>{t('timeline.consolidatedConnections')}：</strong>{it.meta.consolidatedConnections}</div>
                              )}
                              {it.meta.consolidationInfo && (
                                <div><strong>{t('timeline.consolidationInfo')}：</strong>{it.meta.consolidationInfo}</div>
                              )}
                              {it.meta.consolidationResult && (
                                <div><strong>{t('timeline.consolidationResult')}：</strong>{it.meta.consolidationResult}</div>
                              )}
                              {it.meta.consolidationFallback && (
                                <div className="text-orange-600 dark:text-orange-400">
                                  <strong>{t('timeline.consolidationFallback')}：</strong>{it.meta.consolidationFallback}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 显示大模型返回的具体内容 */}
                        {it.meta && it.meta.llmResponse && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                            <div className="text-[11px] text-blue-600 dark:text-blue-400 mb-2 font-medium">🤖 {t('timeline.llmResponse')}</div>
                            {it.meta.llmResponse.clarifyingQuestions && (
                              <div className="mb-2">
                                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{t('timeline.clarifyingQuestions')}：</div>
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded text-xs whitespace-pre-wrap border-l-2 border-yellow-400">
                                  {it.meta.llmResponse.clarifyingQuestions}
                                </div>
                              </div>
                            )}
                            {it.meta.llmResponse.reviewReport && (
                              <div className="mb-2">
                                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{t('timeline.reviewReport')}：</div>
                                <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded text-xs whitespace-pre-wrap border-l-2 border-green-400 max-h-32 overflow-y-auto">
                                  {it.meta.llmResponse.reviewReport}
                                </div>
                              </div>
                            )}
                            {it.meta.llmResponse.fullResponse && !it.meta.llmResponse.clarifyingQuestions && !it.meta.llmResponse.reviewReport && (
                              <div className="mb-2">
                                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{t('timeline.fullResponse')}：</div>
                                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                                  {it.meta.llmResponse.fullResponse}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {it.meta && Object.keys(it.meta).length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-gray-500">完整元数据</summary>
                            <pre className="overflow-auto bg-gray-50 dark:bg-cursorBlack dark:border-cursorBorder p-2 rounded text-xs mt-1">{JSON.stringify(it.meta, null, 2)}</pre>
                          </details>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          })()}
        </div>
      </div>
    </form>
  )
}


