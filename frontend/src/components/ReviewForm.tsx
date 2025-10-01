import React, { useState, useEffect, useRef, useImperativeHandle } from 'react'
import FileUpload from './FileUpload'
import type { SessionSeed } from '../types/session'
import ReactMarkdown from 'react-markdown'
import { useI18n } from '../i18n'

const ReviewForm = React.forwardRef(function ReviewForm({
  agentBaseUrl,
  onResult,
  initialMode,
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
  agentBaseUrl?: string
  initialMode?: 'direct' | 'fine'
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
}, ref: any) {
  const { t, lang } = useI18n() as any
  // agentBaseUrl: agent 后端 base URL（由 App 传入），默认兼容旧路径
  const agentBase = (typeof (agentBaseUrl) === 'string' && agentBaseUrl.trim()) ? agentBaseUrl.trim() : '/api/v1/circuit-agent'
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
  // 中文注释：通过 t() 获取步骤名称，避免硬编码；若缺少翻译，使用本地覆盖映射或友好回退
  function stepLabel(code: string): string {
    try {
      if (!code) return ''
      // 优先尝试 i18n key: step_<code>
      const key = `step_${code}`
      const val = t(key)
      if (val && val !== key) return val

      // 尝试替代 key（点换下划线）
      const altKey = `step_${code.replace(/\./g, '_')}`
      const altVal = t(altKey)
      if (altVal && altVal !== altKey) return altVal

      // 覆盖映射：对常见步骤提供中文友好名称，避免界面出现未翻译的步名
      const OVERRIDES: Record<string, string> = {
        'preparing': '准备中',
        'frontend.preparing': '准备中',
        'uploading_files': '上传文件',
        'frontend.uploading_files': '上传文件',
        'using_cached_enriched_json': '使用本地解析结果',
        'frontend.using_cached_enriched_json': '使用本地解析结果',
        'sending_request': '发送请求',
        'frontend.sending_request': '发送请求',
        'backend.request_received': '请求已接收',
        'backend.request_payload_received': '请求载荷已接收',
        'vision.processing_start': '视觉识别开始',
        'vision.request': '视觉识别请求',
        'vision.response': '视觉识别响应',
        'vision.processing_done': '视觉识别完成',
        'vision.processing_skipped': '视觉处理已跳过',
        // OCR 功能已移除，保留 timeline key 兼容性
        'vision.ocr_start': 'OCR（已移除）',
        'vision.ocr_done': 'OCR（已移除）',
        // 参数补充功能已移除，保留 keys 以免旧数据报错
        'vision.enrichment_start': '参数补充（已移除）',
        'vision.enrichment_done': '参数补充（已移除）',
        'vision.enrichment_skipped': '参数补充（已移除）',
        'llm.analysis_start': '开始二次分析',
        'llm.analysis_done': '二次分析完成',
        'llm.request': 'LLM 请求',
        'llm.response': 'LLM 响应',
        'analysis.result': '分析结果',
        'clarifying_question': '问题确认',
        'analysis_result': '分析结果',
        'done': '完成',
        'aborted': '已中止'
      }
      if (OVERRIDES[code]) return OVERRIDES[code]

      // 最后回退：将 code 的点号替换为空格并首字母大写简化显示
      const human = code.replace(/\./g, ' ')
      return human.charAt(0).toUpperCase() + human.slice(1)
    } catch (e) {
      return code || ''
    }
  }
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState('')
  // 问题确认（已移除）：历史中包含 assistant 的所有条目
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  // 中文注释：记录与大模型交互的步骤时间线（用于展示历史步骤）
  const [timeline, setTimeline] = useState<{ step: string; ts?: number; meta?: any; origin?: string; artifacts?: any; category?: string; tags?: string[] }[]>([])
  // 控制哪些后端 timeline 项被展开以显示详情
  const [expandedTimelineItems, setExpandedTimelineItems] = useState<Record<string, boolean>>({})
  const [localEnrichedJson, setLocalEnrichedJson] = useState<any | null>(null)
  const [saving, setSaving] = useState<boolean>(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false)
  const isHydratingRef = useRef<boolean>(false)
  // 进度轮询：使用 progressId 与后端同步实时 timeline
  const [progressId, setProgressId] = useState<string | null>(null)
  const progressPollRef = useRef<number | null>(null)
  // 立即可用的 progressId（避免 useState 异步导致丢失）
  const progressIdRef = useRef<string | null>(null)
  // Artifact 内容缓存：按 URL 存储已拉取的文本内容
  const [artifactCache, setArtifactCache] = useState<Record<string, { loading: boolean; error?: string; content?: string }>>({})

  // 中文注释：判断是否为图片类资源
  function isImageArtifact(art?: any): boolean {
    try {
      const name = (art?.filename || '').toLowerCase()
      const ct = (art?.contentType || '').toLowerCase()
      return /\.(png|jpg|jpeg|webp|gif)$/i.test(name) || /image\//.test(ct)
    } catch { return false }
  }

  // 中文注释：判断是否可能是 JSON
  function isJsonArtifact(art?: any): boolean {
    try {
      const name = (art?.filename || '').toLowerCase()
      const ct = (art?.contentType || '').toLowerCase()
      return name.endsWith('.json') || ct.includes('application/json')
    } catch { return false }
  }

  // 中文注释：按需加载 artifact 文本内容（兼容 ArtifactRef 结构）
  async function ensureLoadArtifact(art?: any) {
    try {
      if (!art) return
      const url = String(art.url || art.fileUrl || '')
      if (!url) return
      const cached = artifactCache[url]
      if (cached && (cached.loading || cached.content || cached.error)) return
      setArtifactCache((m) => ({ ...m, [url]: { loading: true } }))
      const r = await fetch(url)
      if (!r.ok) throw new Error(`${r.status}`)
      const txt = await r.text()
      setArtifactCache((m) => ({ ...m, [url]: { loading: false, content: txt } }))
    } catch (e: any) {
      try {
        const url = String(art?.url || art?.fileUrl || '')
        setArtifactCache((m) => ({ ...m, [url]: { loading: false, error: e?.message || String(e) } }))
      } catch {}
    }
  }

  // 中文注释：渲染单个 artifact 的内联预览（JSON/文本；图片内联 <img>）
  function ArtifactInline({ label, art }: { label: string; art?: any }) {
    if (!art) return null
    const url = String(art.url || '')
    const cache = artifactCache[url]
    const isImg = isImageArtifact(art)
    const isJson = isJsonArtifact(art)

    return (
      <details className="border rounded border-gray-200 dark:border-gray-600">
        <summary className="cursor-pointer p-2 text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          {label}{art.filename ? ` - ${art.filename}` : ''}
        </summary>
        <div className="p-2 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900">
          {isImg ? (
            <div className="mt-1">
              <img src={url} alt={art.filename || 'image'} className="max-h-64 object-contain border border-gray-100 dark:border-gray-700" />
            </div>
          ) : (
            <div className="mt-1">
              {!cache && (
                <button type="button" className="text-xs px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder" onClick={() => ensureLoadArtifact(art)}>加载内容</button>
              )}
              {cache?.loading && (
                <div className="text-[11px] text-gray-500">加载中...</div>
              )}
              {cache?.error && (
                <div className="text-[11px] text-red-600">加载失败：{cache.error}</div>
              )}
              {cache?.content !== undefined && (
                <pre className="text-[10px] overflow-auto max-h-64 bg-gray-50 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap">
                  {(() => {
                    if (isJson) {
                      try { return JSON.stringify(JSON.parse(cache.content || 'null'), null, 2) } catch { return cache.content }
                    }
                    return cache.content
                  })()}
                </pre>
              )}
            </div>
          )}
        </div>
      </details>
    )
  }
  // 直接 LLM 评审与多轮识别和搜索配置
  // 根据 initialMode 初始化：
  // - 'direct'（单agent评审）：不展示高级的 direct/multi 选项（由模式固定行为）
  // - 'fine'（多agent评审）：默认启用多轮识别
  const [directReview, setDirectReview] = useState<boolean>(() => (initialMode === 'fine' ? false : true))
  const [multiPassRecognition, setMultiPassRecognition] = useState<boolean>(() => (initialMode === 'fine' ? true : false))
  const [enableSearch, setEnableSearch] = useState<boolean>(true)
  const [searchTopN, setSearchTopN] = useState<number>(5)

  // 已移除 questionRef（对应的问题确认窗格）
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

  // 已移除与 questionConfirm 相关的自动调整逻辑

  useEffect(() => {
    adjustHeight(dialogRef.current)
  }, [dialog])

  // NOTE: modelApiUrl, model, modelOptions and related persistence are managed by parent (App).

  // 中文注释：当收到外部会话种子时，回填至本地状态（包括文件重建与 enrichedJson）
  async function applyLoadedSession(seed?: SessionSeed | any) {
    if (!seed) return
    try {
      isHydratingRef.current = true
      setRequirements(seed.requirements || '无')
      setSpecs(seed.specs || '无')
      // questionConfirm 已弃用，忽略 seed.questionConfirm
      setDialog(seed.dialog || '')
      // history
      try {
        const baseHistory = Array.isArray(seed.history) ? [...seed.history] : []
        setHistory(baseHistory)
      } catch {
        setHistory(Array.isArray(seed.history) ? seed.history : [])
      }
      if (seed.enrichedJson) setLocalEnrichedJson(seed.enrichedJson)
      try {
        const loadedTimeline = Array.isArray((seed as any).timeline) ? [...(seed as any).timeline] : []
        setTimeline(loadedTimeline)
        if (loadedTimeline.length > 0) {
          const lastStep = loadedTimeline[loadedTimeline.length - 1]
          setProgressStep(lastStep.step)
          try {
            const firstStep = loadedTimeline[0]
            if (firstStep.ts && lastStep.ts) setElapsedMs(Math.max(0, lastStep.ts - firstStep.ts))
          } catch {}
        }
        if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
      } catch {}

      // 文件重建
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
          } catch {}
        }
        setFiles(rebuilt)
      } else setFiles([])
      setHasUnsavedChanges(false)
    } catch (e) {
      // ignore
    } finally {
      isHydratingRef.current = false
    }
  }

  useEffect(() => { if (sessionSeed) applyLoadedSession(sessionSeed) }, [sessionSeed])

  // 中文注释：监听关键字段变化，标记为"有未保存更改"（在加载期不触发）
  useEffect(() => {
    if (isHydratingRef.current) return
    setHasUnsavedChanges(true)
  }, [requirements, specs, dialog, history, files, localEnrichedJson, markdown, overlay])

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
      // 在提交流程开始时重置并记录第一条 timeline 条目（避免多次提交造成重复堆叠）
      setTimeline([{ step: 'preparing', ts: Date.now() }])
      // 生成 progressId，并启动轮询以从后端获取实时 timeline（若后端支持）
      try {
        const pid = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        setProgressId(pid)
        progressIdRef.current = pid
        // 启动轮询
        if (progressPollRef.current) window.clearInterval(progressPollRef.current)
        progressPollRef.current = window.setInterval(async () => {
          try {
        const r = await fetch(`${agentBase}/progress/${encodeURIComponent(pid)}`)
            if (!r.ok) return
            const j = await r.json()
            if (Array.isArray(j.timeline)) {
              // 优先使用后端 timeline，保留本地仅以 'preparing/uploading_files/using_cached_enriched_json/sending_request' 前缀的前置步骤
              setTimeline((t) => {
                const localPrefix = (t || []).filter(x => ['preparing','uploading_files','using_cached_enriched_json','sending_request'].includes(x.step))
                const remote = j.timeline.map((it: any) => ({ step: it.step, ts: it.ts, origin: it.origin || 'backend', category: it.category || (it.meta && it.meta.modelType) || 'other', meta: it.meta || {}, artifacts: it.artifacts || {}, tags: it.tags || [] }))
                // 按时间排序
                const merged = localPrefix.concat(remote).sort((a: any, b: any) => (a.ts || 0) - (b.ts || 0))
                // 去重策略（加强版）：考虑 passNumber / tryUrl / artifact URL，避免多轮步骤被折叠
                const seen = new Set<string>()
                const uniq: any[] = []
                for (const item of merged) {
                  const keyParts = [item.step || '']
                  try {
                    const m = item.meta || {}
                    const a = item.artifacts || {}
                    // 多轮识别：加入 passNumber / passOfTotal / tryUrl
                    if (m.passNumber) keyParts.push(`pass:${m.passNumber}`)
                    if (m.passOfTotal) keyParts.push(`of:${m.passOfTotal}`)
                    if (m.tryUrl) keyParts.push(`url:${m.tryUrl}`)
                    // artifact 参考（新旧两种位置）
                    const reqUrl = (a.request && (a.request.url || a.request.id)) || (m.requestArtifact && (m.requestArtifact.url || m.requestArtifact.id))
                    const respUrl = (a.response && (a.response.url || a.response.id)) || (m.responseArtifact && (m.responseArtifact.url || m.responseArtifact.id))
                    if (reqUrl) keyParts.push(`req:${String(reqUrl)}`)
                    if (respUrl) keyParts.push(`resp:${String(respUrl)}`)
                    // LLM 请求签名（若存在）
                    if (m.requestSignature) keyParts.push(String(m.requestSignature))
                  } catch {}
                  // 最后兜底：若仍过于相似，加入时间戳的低位（降低被全部折叠的概率）
                  try { if (item.ts) keyParts.push(`t:${String(item.ts).slice(-4)}`) } catch {}
                  const key = keyParts.join('|')
                  if (!seen.has(key)) { seen.add(key); uniq.push(item) }
                }
                return uniq
              })
            }
          } catch {}
        }, 1000)
      } catch {}
      // 中文注释：在发送前仅创建"提交快照"，不立即改动界面；等待上游返回后再入历史与翻页
      const dialogTrimmed = (dialog || '').trim()
      const submittedDialog = dialogTrimmed
      const historySnapshot = submittedDialog ? history.concat([{ role: 'user' as const, content: submittedDialog }]) : history

      const fd = new FormData()
      // 将 progressId 传给后端以关联进度（使用 ref 确保立即可用）
      if (progressIdRef.current) fd.append('progressId', progressIdRef.current)
      // 中文注释：后端路由层已通过 PromptLoader 自动加载提示词，前端只需传递 language 参数
      fd.append('language', lang)
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
      // include directReview flag to instruct backend to skip vision parsing
      fd.append('directReview', directReview ? 'true' : 'false')
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
        // 后端已固定为 5 步流水线，前端不可修改
        fd.append('recognitionPasses', '5')
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
        const endpoint = `${agentBase}/orchestrate/review`
        res = await fetch(endpoint, { method: 'POST', body: fd, headers, signal: controller.signal })
      } finally {
        clearTimeout(timeoutId)
        // 请求结束后清理 controllerRef
        controllerRef.current = null
      }

      // 为避免多次消费 Response body（导致 "Response body is already used"），
      // 统一读取一次文本并根据 content-type 解析为 JSON 以复用。
      const contentType = res.headers.get('content-type') || ''
      let bodyText = ''
      try { bodyText = await res.text() } catch (e) { bodyText = '' }
      let bodyJson: any = null
      if (contentType.includes('application/json')) {
        try { bodyJson = JSON.parse(bodyText) } catch (e) { bodyJson = null }
      }

      if (!res.ok) {
        if (res.status === 422 && bodyJson) {
          const j = bodyJson
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
          throw new Error(bodyText || `Status ${res.status}`)
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
      let md = ''
      let qFromJson: any = ''
      // 如果后端返回包含 timeline，则使用该信息更新进度与计时显示
      if (contentType.includes('application/json')) {
        const peek = bodyJson
        if (peek && peek.timeline && Array.isArray(peek.timeline)) {
          // 仅用于计算耗时，不在此处合并 timeline，避免重复合并
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
        const j = bodyJson || {}
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
            const remote = j.timeline.map((x: any) => ({
              step: x.step,
              ts: x.ts,
              origin: x.origin || 'backend',
              category: x.category || (x.meta && x.meta.modelType) || 'other',
              meta: x.meta || {},
              artifacts: x.artifacts || {},
              tags: x.tags || []
            }))
            setTimeline((t) => {
              // 用最终完整的远端 timeline 覆盖合并，避免重复
              const localPrefix = t.filter(x => ['preparing','uploading_files','using_cached_enriched_json','sending_request'].includes(x.step))
              return localPrefix.concat(remote)
            })
            // 如果后端返回包含 direct-review 专用步骤，更新进度展示
            try {
              const steps: string[] = remote.map((r: any) => r.step)
              if (steps.includes('backend.saved_uploads')) setProgressStep('sending_request')
              if (steps.includes('llm.analysis_start')) setProgressStep('second_stage_analysis_start')
              if (steps.includes('llm.analysis_done')) setProgressStep('second_stage_analysis_done')
              if (steps.includes('analysis.result')) setProgressStep('analysis_result')
            } catch {}
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
        md = bodyText
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
        // qcText 为模型给出的 clarifying text，已改为加入 history 而非单独保存
        // if (qcText) setQuestionConfirm(qcText)
        // 多轮记录：同时把问题确认与评审报告分别记入历史，便于分页查看
        const newEntries: { role: 'user' | 'assistant'; content: string; attachmentsMeta?: any[]; ts?: number }[] = []
        if (submittedDialog) newEntries.push({ role: 'user', content: submittedDialog, attachmentsMeta: files.map(f => ({ name: f.name, type: f.type, size: f.size })), ts: Date.now() })
        if (qcText) newEntries.push({ role: 'assistant', content: qcText, ts: Date.now() })
        if (reportPart && reportPart.trim()) newEntries.push({ role: 'assistant', content: reportPart.trim(), ts: Date.now() })
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
          // if (qcText) setQuestionConfirm(qcText)
          // 不展示结果视图，等待用户补充信息后再提交
          // 同样记录本轮 user 与 assistant（问题确认）到 history
          const entries: { role: 'user' | 'assistant'; content: string; attachmentsMeta?: any[]; ts?: number }[] = []
          if (submittedDialog) entries.push({ role: 'user', content: submittedDialog, attachmentsMeta: files.map(f => ({ name: f.name, type: f.type, size: f.size })), ts: Date.now() })
          if (qcText) entries.push({ role: 'assistant', content: qcText, ts: Date.now() })
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
          // if (questionParts.length > 0) setQuestionConfirm(questionParts.join('\n\n'))
          if (md && md.trim()) {
            onResult(md.trim())
            const entries: { role: 'user' | 'assistant'; content: string; attachmentsMeta?: any[]; ts?: number }[] = []
            if (submittedDialog) entries.push({ role: 'user', content: submittedDialog, attachmentsMeta: files.map(f => ({ name: f.name, type: f.type, size: f.size })), ts: Date.now() })
            entries.push({ role: 'assistant', content: md.trim(), ts: Date.now() })
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
      // 停止进度轮询
      if (progressPollRef.current) {
        window.clearInterval(progressPollRef.current)
        progressPollRef.current = null
      }
      // 清除 progressId
      setProgressId(null)
      progressIdRef.current = null
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

  // 向外暴露保存会话方法（供 wrapper 调用）
  useImperativeHandle(ref, () => ({
    saveSession: async () => {
      return await handleSaveSession()
    }
  }))

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
        // questionConfirm 已弃用，历史中包含 assistant 的所有条目
        questionConfirm: undefined,
        dialog,
        history,
        // 将本地 timeline 一并持久化（若有）
        timeline: timeline.length > 0 ? timeline : undefined,
        markdown: markdown || '',
        enrichedJson: localEnrichedJson || undefined,
        overlay: overlay || undefined,
        files: filesPayload,
      }

      const res = await fetch(`${agentBase}/sessions/save`, {
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

  // 中文注释：页或历史变更时，自动调整对话窗格的高度以适配内容
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
      // questionConfirm 已弃用
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
    <form onSubmit={handleSubmit} className="space-y-4 glass-soft">
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
      {/* 高级配置：按 initialMode 条件渲染 */}
      {initialMode !== 'direct' && (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">{t('form.advanced.label')}</div>
          <div className="space-y-3">
            {/* 当 initialMode !== 'direct' 时，显示多轮识别相关（多agent 模式保留多轮与搜索） */}
            {initialMode === 'fine' && (
              <>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={multiPassRecognition}
                      onChange={(e) => { setMultiPassRecognition(e.target.checked); if (e.target.checked) setDirectReview(false); }}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">{t('form.multiPass.enable')}</span>
                  </label>
                  <div className="text-xs text-gray-500 dark:text-gray-400 ml-2">{multiPassRecognition ? t('form.multiPass.multiNote') : t('form.multiPass.singleNote')}</div>
                </div>

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
              </>
            )}
          </div>
        </div>
      )}

      {/* 单agent（direct）模式：保留启用器件搜索的选项（仅搜索开关） */}
      {initialMode === 'direct' && (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">{t('form.advanced.label')}</div>
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
                  {[3,5,10,15,20].map(n => (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 文件上传已在上方显示，避免重复显示 */}

      <div className="grid grid-cols-1 gap-2">
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
        <button type="button" className="px-4 py-2 bg-white border dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder rounded-md transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500" onClick={() => {
          try {
            // 导出当前显示的评审结果（markdown）为 .doc（前端触发下载）
            const md = markdown || ''
            const blob = new Blob([md], { type: 'application/msword' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `review_report_${Date.now()}.doc`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
          } catch (e) { alert('导出失败') }
        }}>
          导出报告
        </button>
        {/* 保存会话按钮移至 Agent 层（wrapper） */}
      </div>
      {/* 将时间线放到按钮下方 */}
      <div className="mt-3 text-xs text-gray-500 dark:text-gray-300">
        <div className="font-medium text-gray-700 dark:text-gray-200">{t('timeline.label') || '步骤历史'}</div>
        <div className="mt-1 space-y-2">
            {(() => {
            // 显示所有步骤，包括前端和后端步骤，但过滤掉已移除的功能步骤（如 OCR）
            const allTimeline = timeline || []
            function isRemovedStep(step?: string) {
              try {
                if (!step) return false
                // 隐藏已移除的功能步骤（OCR 与 参数补充）
                return /\bocr\b|ocr_|ocr\.|enrich|enrichment|param_enrich|paramenrich|enrichment_skipped|enrichment_done|enrichment_start/i.test(step)
              } catch (e) { return false }
            }

            const visibleTimeline = allTimeline.filter((it) => !isRemovedStep(it.step))
            if (!visibleTimeline || visibleTimeline.length === 0) return <div className="text-xs text-gray-400">{t('step_idle')}</div>

            // 为前端步骤添加更详细的元数据
            const enhancedTimeline = visibleTimeline.map((item, index) => {
              const enhancedItem: any = { ...item }

              // 分类步骤类型
              function getStepType(step: string): { type: string; modelType?: string; description: string } {
                const aiSteps = {
                  'images_processing_start': { type: 'ai_interaction', modelType: 'vision', description: '开始进行视觉识别与解析' },
                  'images_processing_done': { type: 'ai_interaction', modelType: 'vision', description: '视觉识别解析完成，生成结构化结果' },
                  'multi_pass_recognition_start': { type: 'ai_interaction', modelType: 'vision', description: '启动多轮视觉识别以提升准确性' },
                  'multi_pass_recognition_done': { type: 'ai_interaction', modelType: 'vision', description: '多轮视觉识别结束，汇总各轮结果' },
                  'recognition_consolidation_start': { type: 'ai_interaction', modelType: 'llm', description: '开始整合多轮识别结果' },
                  'recognition_consolidation_done': { type: 'ai_interaction', modelType: 'llm', description: '完成识别结果整合并生成统一输出' },
                  'recognition_consolidation_fallback': { type: 'ai_interaction', modelType: 'vision', description: '整合失败，回退到最佳单轮结果' },
                  'vision_model_request': { type: 'ai_interaction', modelType: 'vision', description: '发送视觉识别请求（包含图像与提示）' },
                  'vision_model_response': { type: 'ai_interaction', modelType: 'vision', description: '接收视觉识别响应（结构化 JSON）' },
                  'ocr_recognition_start': { type: 'ai_interaction', modelType: 'vision', description: '开始 OCR 辅助识别与预处理' },
                  'ocr_recognition_done': { type: 'ai_interaction', modelType: 'vision', description: '完成 OCR 识别并融合结果' },
                  'ocr_recognition_failed': { type: 'ai_interaction', modelType: 'vision', description: 'OCR 识别失败，继续后续流程' },
                  'llm_request': { type: 'ai_interaction', modelType: 'llm', description: '发送大语言模型请求（含上下文与JSON）' },
                  'llm_response': { type: 'ai_interaction', modelType: 'llm', description: '接收大语言模型响应' },
                  // 兼容新的点号命名
                  'llm.request': { type: 'ai_interaction', modelType: 'llm', description: '发送大语言模型请求（含上下文与JSON）' },
                  'llm.response': { type: 'ai_interaction', modelType: 'llm', description: '接收大语言模型响应' },
                  'second_stage_analysis_start': { type: 'ai_interaction', modelType: 'llm', description: '开始二次分析（评审生成）' },
                  'second_stage_analysis_done': { type: 'ai_interaction', modelType: 'llm', description: '二次分析完成（产出评审报告）' }
                }

                if (aiSteps[step as keyof typeof aiSteps]) {
                  return aiSteps[step as keyof typeof aiSteps]
                }

                // 前端步骤
                if (['preparing', 'uploading_files', 'using_cached_enriched_json', 'sending_request', 'done'].includes(step)) {
                  return { type: 'frontend', description: '前端操作' }
                }

                // 后端辅助步骤
                if (['request_received', 'request_payload_received', 'vision_batch_request', 'datasheets_fetch_done', 'images_processing_skipped'].includes(step)) {
                  return { type: 'backend', description: '后端处理' }
                }

                // 错误步骤
                if (['aborted'].includes(step)) {
                  return { type: 'error', description: '操作异常' }
                }

                return { type: 'unknown', description: '未知步骤' }
              }

              const stepInfo = getStepType(item.step)

              // 为前端对话步骤添加内容（兼容新命名空间）
              if (item.step === 'preparing' || item.step === 'frontend.preparing') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  action: t('step_preparing'),
                  description: stepInfo.description,
                  files: files.map(f => ({ name: f.name, size: f.size, type: f.type }))
                }
              } else if (item.step === 'uploading_files' || item.step === 'frontend.uploading_files') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  action: t('step_uploading_files'),
                  description: stepInfo.description,
                  files: files.map(f => ({ name: f.name, size: f.size, type: f.type }))
                }
              } else if (item.step === 'using_cached_enriched_json' || item.step === 'frontend.using_cached_enriched_json') {
                enhancedItem.meta = {
                  type: stepInfo.type,
                  action: t('step_using_cached_enriched_json'),
                  description: stepInfo.description,
                  cachedData: localEnrichedJson ? '包含已解析的图片结构化数据' : '无缓存数据'
                }
              } else if (item.step === 'sending_request' || item.step === 'frontend.sending_request') {
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
              } else if (item.step === 'vision_model_request') {
                const meta = item.meta || {}
                const pn = Number(meta.passNumber || 0)
                const pt = Number(meta.passOfTotal || 0)
                const roundTitle = (pn > 0 && pt > 0) ? `第 ${pn}/${pt} 轮 · 视觉模型请求` : '视觉模型请求'
                // 仅在后端未提供 action 时，前端才填充 roundTitle，避免重复或覆盖后端自定义文本
                const actionToUse = (meta.action && String(meta.action).trim()) ? meta.action : roundTitle
                enhancedItem.meta = Object.assign({}, meta, {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: actionToUse,
                })
              } else if (item.step === 'vision_model_response') {
                const meta = item.meta || {}
                const pn = Number(meta.passNumber || 0)
                const pt = Number(meta.passOfTotal || 0)
                const roundTitle = (pn > 0 && pt > 0) ? `第 ${pn}/${pt} 轮 · 视觉模型响应` : '视觉模型响应'
                const actionToUseResp = (meta.action && String(meta.action).trim()) ? meta.action : roundTitle
                enhancedItem.meta = Object.assign({}, meta, {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: actionToUseResp,
                })
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
                // 保留后端原有 meta 字段（例如 requestArtifact）并在其上补充展示信息
                const actionToUse = (meta.action && String(meta.action).trim()) ? meta.action : '开始结果整合'
                enhancedItem.meta = Object.assign({}, meta, {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: actionToUse,
                  description: stepInfo.description,
                  resultCount: meta.resultCount,
                  consolidationInfo: `使用大模型整合${meta.resultCount}个识别结果，生成最准确的最终结果`
                })
              } else if (item.step === 'recognition_consolidation_done') {
                const meta = item.meta || {}
                // 保留后端的 artifacts/request/response 信息，不要覆盖
                const actionToUseDone = (meta.action && String(meta.action).trim()) ? meta.action : '结果整合完成'
                enhancedItem.meta = Object.assign({}, meta, {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: actionToUseDone,
                  description: stepInfo.description,
                  resultCount: meta.resultCount,
                  consolidatedComponents: meta.consolidatedComponents,
                  consolidatedConnections: meta.consolidatedConnections,
                  consolidationResult: `成功整合${meta.resultCount}个结果，最终生成${meta.consolidatedComponents}个器件和${meta.consolidatedConnections}条连接`
                })
              } else if (item.step === 'recognition_consolidation_fallback') {
                const meta = item.meta || {}
                const actionToUseFallback = (meta.action && String(meta.action).trim()) ? meta.action : '结果整合回退'
                enhancedItem.meta = Object.assign({}, meta, {
                  type: stepInfo.type,
                  modelType: stepInfo.modelType,
                  action: actionToUseFallback,
                  description: stepInfo.description,
                  resultCount: meta.resultCount,
                  fallbackComponents: meta.fallbackComponents,
                  fallbackConnections: meta.fallbackConnections,
                  consolidationFallback: `整合失败，使用最佳单轮结果：${meta.fallbackComponents}个器件，${meta.fallbackConnections}条连接`
                })
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
              // 更新分组逻辑：统一为语义化类别键（frontend, vision, search, llm, request, response, other）
              let groupKey = 'other'
              if (/images_processing/i.test(step)) groupKey = 'vision'
              else if (/datasheets_fetch|search|fetch/i.test(step)) groupKey = 'search'
              else if (/second_stage_analysis/i.test(step)) groupKey = 'llm'
              else if (/request|sending|llm_request|request_received/i.test(step)) groupKey = 'request'
              else if (/preparing|uploading|using_cached|aborted|done/i.test(step)) groupKey = 'frontend'
              else if (/analysis|clarifying_question/i.test(step)) groupKey = 'response'

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
                  <div className="flex items-start justify-between gap-2 p-1 cursor-pointer" onClick={() => {
                    const willExpand = !expandedTimelineItems[key]
                    try {
                      setExpandedTimelineItems((s) => ({ ...s, [key]: willExpand }))
                    } catch (e) {}
                    if (willExpand) {
                      try {
                        // 自动触发非图片类 artifact 的内容加载，避免拉取二进制大文件作为文本
                        const arts = it.artifacts || {}
                        try { Object.values(arts).forEach((a: any) => { if (a && !isImageArtifact(a)) ensureLoadArtifact(a) }) } catch (e) {}
                        // 兼容旧 meta 字段中的 requestArtifact/responseArtifact
                        try { if (it.meta && it.meta.requestArtifact && !isImageArtifact(it.meta.requestArtifact)) ensureLoadArtifact(it.meta.requestArtifact) } catch (e) {}
                        try { if (it.meta && it.meta.responseArtifact && !isImageArtifact(it.meta.responseArtifact)) ensureLoadArtifact(it.meta.responseArtifact) } catch (e) {}
                      } catch (e) {}
                    }
                  }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm dark:text-gray-200 flex items-center gap-2">
                        <span className={`w-5 h-5 inline-flex items-center justify-center rounded-full text-xs ${isError ? 'text-red-600' : (isAIInteraction ? 'text-purple-600' : (isLLMResponse ? 'text-blue-600' : (isVisionResult ? 'text-green-600' : (isCurrent ? 'text-yellow-600' : 'text-gray-500'))))}`}>
                          {isError ? '✖' : (isAIInteraction ? '🧠' : (isLLMResponse ? '🤖' : (isVisionResult ? '👁️' : (isCurrent ? '●' : '○'))))}
                        </span>
                        <div className="truncate">{stepLabel(it.step) || it.step}</div>
                        {/* 统一 badge 渲染：仅渲染一个统一样式的标识，颜色/文本根据元数据决定 */}
                        {(() => {
                          const meta = it.meta || {}
                          const modelType = meta.modelType || ''
                          let badgeLabel = ''
                          let badgeBgClass = ''
                          if (isError) {
                            badgeLabel = 'ERR'
                            badgeBgClass = 'bg-red-600'
                          } else if (modelType === 'llm') {
                            badgeLabel = 'LLM'
                            badgeBgClass = 'bg-blue-600'
                          } else if (modelType === 'vision') {
                            badgeLabel = '视觉'
                            badgeBgClass = 'bg-green-600'
                          } else if (it.meta && it.meta.type === 'ai_interaction') {
                            badgeLabel = 'AI'
                            badgeBgClass = 'bg-purple-600'
                          } else if (isCurrent) {
                            badgeLabel = '●'
                            badgeBgClass = 'bg-yellow-500'
                          } else {
                            badgeLabel = '○'
                            badgeBgClass = 'bg-gray-300'
                          }

                          return (
                            <span className={`ml-2 text-[10px] px-1 py-0.5 rounded text-white ${badgeBgClass}`} style={{ lineHeight: 1 }}>
                              {badgeLabel}
                            </span>
                          )
                        })()}
                      </div>
                      {/* 小标题单独显示在大标题下方，避免与标题同行过长 */}
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                        {(() => {
                          const meta = it.meta || {}
                          const parts: string[] = []
                          let rawGroup = ''
                          try { rawGroup = t(`timeline.group.${groupKey}`) } catch { rawGroup = groupKey }

                          // 规范化标签：去除常见后缀以避免重复（例如："前端步骤" 和 "前端"）
                          function normalizeLabel(s: string) {
                            if (!s) return ''
                            return String(s).replace(/步骤|处理|阶段|操作/gi, '').trim()
                          }

                          const g = normalizeLabel(rawGroup)
                          // primary label: 优先使用 action，否则使用 step label
                          const primary = (meta.action && String(meta.action).trim()) ? String(meta.action).trim() : (stepLabel(it.step) || it.step)

                          const originVal = it.origin || (it.meta && it.meta.origin) ? (it.origin || String(it.meta.origin)) : ((it.meta && it.meta.type === 'backend') ? 'backend' : 'frontend')
                          const originRaw = originVal === 'backend' ? t('timeline.origin.backend') : t('timeline.origin.frontend')
                          const originTag = normalizeLabel(originRaw)

                          // 组装 parts：优先显示 group（简短），然后可能显示 origin（若与 group 不同且 primary 不包含它），最后显示 primary
                          if (g) parts.push(g)
                          if (originTag && originTag !== g && !(primary && String(primary).includes(originTag))) parts.push(originTag)
                          if (primary && !parts.some(p => String(p).toLowerCase() === String(primary).toLowerCase())) parts.push(primary)

                          // 附加描述/内容（避免重复），但限制副标题片段数量以防冗长
                          const desc = (meta.description && String(meta.description).trim()) ? String(meta.description).trim() : ''
                          const content = (meta.content && !meta.modelType && String(meta.content).trim()) ? String(meta.content).trim() : ''
                          function isDup(a: string, b: string) {
                            if (!a || !b) return false
                            const la = a.toLowerCase()
                            const lb = b.toLowerCase()
                            return la === lb || la.includes(lb) || lb.includes(la)
                          }
                          if (desc && !parts.some(p => isDup(p, desc))) parts.push(desc)
                          if (content && !parts.some(p => isDup(p, content)) && !isDup(content, desc)) parts.push(content)

                          const MAX_PARTS = 2
                          return parts.filter(Boolean).slice(0, MAX_PARTS).join(' · ')
                        })()}
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

                              {/* 新增：针对后端 direct 模式 LLM 请求 meta 的关键信息展示 */}
                              {(!it.meta.analysisRequest && (it.step === 'llm.request' || it.step === 'llm_request') || /llm\.request/i.test(String(it.step || ''))) && (
                                <>
                                  {it.meta?.model && (<div><strong>{t('timeline.languageModel')}：</strong>{it.meta.model}</div>)}
                                  {it.meta?.apiUrl && (<div><strong>{t('timeline.apiUrl')}：</strong>{it.meta.apiUrl}</div>)}
                                  {typeof it.meta?.messageCount === 'number' && (<div><strong>{t('timeline.messageCount')}：</strong>{it.meta.messageCount}</div>)}
                                  {typeof it.meta?.hasHistory === 'boolean' && (<div><strong>{t('timeline.hasHistory')}：</strong>{it.meta.hasHistory ? '是' : '否'}</div>)}
                                  {typeof it.meta?.hasAttachments === 'boolean' && (<div><strong>{t('timeline.hasFiles')}：</strong>{it.meta.hasAttachments ? '是' : '否'}</div>)}
                                </>
                              )}

                              {/* 新增：针对 LLM 响应 meta 的关键信息展示 */}
                              {((it.step === 'llm.response' || it.step === 'llm_response') || /llm\.response/i.test(String(it.step || ''))) && (
                                <>
                                  {typeof it.meta?.contentLength === 'number' && (<div><strong>{t('timeline.responseSize')}：</strong>{it.meta.contentLength} bytes</div>)}
                                </>
                              )}

                              {/* 旧 meta 中的 artifact 渲染已迁移为使用 it.artifacts；此处由后面的通用区块统一渲染 */}

                            </div>
                          </div>
                        )}

                        {/* 通用：若存在 artifact 引用，内嵌渲染（独立于 requestInfo），不跳新页 */}
                        {(
                          (it.artifacts && (it.artifacts.request || it.artifacts.response || it.artifacts.parsed || it.artifacts.multiPassSummary || it.artifacts.finalCircuit || it.artifacts.overlay || it.artifacts.metadata || it.artifacts.datasheetsMetadata || it.artifacts.preprocessedImage || it.artifacts.ocrText || it.artifacts.ocrWords || it.artifacts.result))
                          || (it.meta && (it.meta.requestArtifact || it.meta.responseArtifact))
                        ) && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2 space-y-2">
                            {it.artifacts.request && (<ArtifactInline label="Request" art={it.artifacts.request} />)}
                            {it.artifacts.response && (<ArtifactInline label="Response" art={it.artifacts.response} />)}
                            {it.artifacts.parsed && (<ArtifactInline label="Parsed JSON" art={it.artifacts.parsed} />)}
                            {it.artifacts.multiPassSummary && (<ArtifactInline label="Multi-pass Summary" art={it.artifacts.multiPassSummary} />)}
                            {it.artifacts.finalCircuit && (<ArtifactInline label="Final Circuit JSON" art={it.artifacts.finalCircuit} />)}
                            {it.artifacts.overlay && (<ArtifactInline label="Overlay" art={it.artifacts.overlay} />)}
                            {it.artifacts.metadata && (<ArtifactInline label="Metadata" art={it.artifacts.metadata} />)}
                            {it.artifacts.datasheetsMetadata && (<ArtifactInline label="Datasheets Metadata" art={it.artifacts.datasheetsMetadata} />)}
                            {it.artifacts.preprocessedImage && (<ArtifactInline label="预处理图像" art={it.artifacts.preprocessedImage} />)}
                            {it.artifacts.ocrText && (<ArtifactInline label="文本（OCR 已移除，如需恢复请使用外部 OCR）" art={it.artifacts.ocrText} />)}
                            {it.artifacts.ocrWords && (<ArtifactInline label="词级信息（OCR 已移除）" art={it.artifacts.ocrWords} />)}
                            {it.artifacts.result && (<ArtifactInline label="Review Report" art={it.artifacts.result} />)}
                            {/* 兼容旧 meta.* 引用（后端某些步骤将 artifact 放在 meta 中） */}
                            {(!it.artifacts.request && it.meta?.requestArtifact) && (<ArtifactInline label="Request" art={it.meta.requestArtifact} />)}
                            {(!it.artifacts.response && it.meta?.responseArtifact) && (<ArtifactInline label="Response" art={it.meta.responseArtifact} />)}
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

                        {/* 新增：如果 timeline 的 meta 包含 requestArtifact/responseArtifact，尝试直接显示已加载的原始内容（优先级高于 artifact inline） */}
                        {it.meta && (it.meta.requestArtifact || it.meta.responseArtifact) && (
                          <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-2">
                            <div className="text-[11px] text-purple-600 dark:text-purple-400 mb-2 font-medium">🔍 原始请求/返回</div>
                            <div className="space-y-2 text-xs">
                              {it.meta.requestArtifact && (() => {
                                const art = it.meta.requestArtifact
                                const url = String(art?.url || art?.fileUrl || '')
                                const cache = artifactCache[url]
                                return (
                                  <div>
                                    <div><strong>Request Artifact:</strong> {art?.filename || url}</div>
                                    {cache?.content ? (
                                      <pre className="text-[10px] overflow-auto max-h-48 bg-gray-50 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap">{cache.content}</pre>
                                    ) : (
                                      <div className="text-[11px] text-gray-500">{cache?.loading ? '加载中...' : (<button type="button" className="text-xs px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText" onClick={() => ensureLoadArtifact(art)}>加载原始请求</button>)}</div>
                                    )}
                                  </div>
                                )
                              })()}

                              {it.meta.responseArtifact && (() => {
                                const art = it.meta.responseArtifact
                                const url = String(art?.url || art?.fileUrl || '')
                                const cache = artifactCache[url]
                                return (
                                  <div>
                                    <div><strong>Response Artifact:</strong> {art?.filename || url}</div>
                                    {cache?.content ? (
                                      <pre className="text-[10px] overflow-auto max-h-48 bg-gray-50 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap">{cache.content}</pre>
                                    ) : (
                                      <div className="text-[11px] text-gray-500">{cache?.loading ? '加载中...' : (<button type="button" className="text-xs px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText" onClick={() => ensureLoadArtifact(art)}>加载原始返回</button>)}</div>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
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

})

export default ReviewForm

