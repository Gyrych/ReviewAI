import React, { useState, useEffect } from 'react'
import ReviewForm from './components/ReviewForm'
import CircuitReviewForm from './agents/circuit/ReviewForm'
import CircuitFineReviewForm from './agents/circuit-fine/ReviewForm'
import ResultView from './components/ResultView'
import type { SessionFileV1, SessionListItem, SessionSeed } from './types/session'
import { useI18n } from './i18n'

export default function App() {
  const { lang, setLang, t } = useI18n()
  // 中文注释：模型预设常量，便于判断是否应该使用下拉而非自定义
  const OPENROUTER_MODEL_PRESETS = [
    'openai/gpt-5',
    'openai/gpt-5-mini',
    'openai/gpt-5-nano',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash',
    'x-ai/grok-4',
    'x-ai/grok-4-fast:free',
    'qwen/qwen2.5-vl-32b-instruct',
    'qwen/qwen2.5-vl-32b-instruct:free',
    'qwen/qwen2.5-vl-72b-instruct',
    'qwen/qwen2.5-vl-72b-instruct:free',
    'qwen/qwen-vl-plus',
    'qwen/qwen-vl-max',
  ]
  const DEFAULT_MODEL_PRESETS = ['deepseek-chat', 'deepseek-reasoner']
  // 静态注册的 Agent 列表（仅保留两种电路图评审）
  // 在开发环境下，某些 agent 服务运行在不同端口（circuit-agent:4001, circuit-fine-agent:4002）
  // 因此为保证请求能正确到达，DEV 模式下使用完整 host:port 路径；生产环境仍使用相对路径。
  const isDev = Boolean((import.meta as any).env && (import.meta as any).env.DEV)
  const AGENTS: { id: string; label: string; baseUrl: string }[] = [
    { id: 'circuit', label: t('app.tabs.circuit_single'), baseUrl: isDev ? 'http://localhost:4001/api/v1/circuit-agent' : '/api/v1/circuit-agent' },
    { id: 'circuit-fine', label: t('app.tabs.circuit_multi'), baseUrl: isDev ? 'http://localhost:4002/api/v1/circuit-fine-agent' : '/api/v1/circuit-fine-agent' },
  ]
  // per-agent UI state maps，确保不同 agent 之间互不干扰
  const [markdownMap, setMarkdownMap] = useState<Record<string, string>>(() => AGENTS.reduce((m, a) => (m[a.id] = '', m), {} as Record<string, string>))
  const [enrichedJsonMap, setEnrichedJsonMap] = useState<Record<string, any | null>>(() => AGENTS.reduce((m, a) => (m[a.id] = null, m), {} as Record<string, any | null>))
  const [overlayMap, setOverlayMap] = useState<Record<string, any | null>>(() => AGENTS.reduce((m, a) => (m[a.id] = null, m), {} as Record<string, any | null>))
  const [activeTab, setActiveTab] = useState<'circuit' | 'circuit-fine'>('circuit')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('theme') as 'light' | 'dark') || 'light' } catch(e){ return 'light' }
  })

  // 公共配置：模型 API、模型名、API Key 等，抽离到 App 级别保持跨选项卡不变
  // 固定使用 OpenRouter 作为外部模型提供者
  const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
  const [allowedApiUrls, setAllowedApiUrls] = useState<string[]>([OPENROUTER_API_URL])
  const [modelApiUrl, setModelApiUrl] = useState<string>(OPENROUTER_API_URL)
  const [customApiUrl, setCustomApiUrl] = useState<string>('')
  const [model, setModel] = useState<string>(OPENROUTER_MODEL_PRESETS[0])
  const [customModelName, setCustomModelName] = useState<string>('')
  const [modelOptions, setModelOptions] = useState<string[]>(['deepseek-chat', 'deepseek-reasoner'])
  const [apiKey, setApiKey] = useState<string>(() => {
    try { return localStorage.getItem('apiKey') || '' } catch (e) { return '' }
  })
  // 中文注释：会话加载相关状态
  const [sessionsVisible, setSessionsVisible] = useState<boolean>(false)
  const [sessionListMap, setSessionListMap] = useState<Record<string, SessionListItem[]>>(() => AGENTS.reduce((m, a) => (m[a.id] = [], m), {} as Record<string, SessionListItem[]>))
  const [sessionSeedMap, setSessionSeedMap] = useState<Record<string, SessionSeed | null>>(() => AGENTS.reduce((m, a) => (m[a.id] = null, m), {} as Record<string, SessionSeed | null>))
  // 新增：实时 timeline 状态，用于 ResultView 在没有 sessionSeed 时展示最近一次的 timeline
  const [liveTimelineMap, setLiveTimelineMap] = useState<Record<string, { step: string; ts?: number; meta?: any }[] | undefined>>(() => AGENTS.reduce((m, a) => (m[a.id] = undefined, m), {} as Record<string, { step: string; ts?: number; meta?: any }[] | undefined>))

  // 根据选中的 API 自动切换可选模型列表（OpenRouter 使用特定候选）
  // 仅提供 OpenRouter 预设模型
  useEffect(() => { setModelOptions([...OPENROUTER_MODEL_PRESETS, 'custom'].sort((a,b) => a.localeCompare(b))) }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('savedApiModelPairs')
      if (raw) {
        const obj = JSON.parse(raw || '{}') as Record<string,string>
        const keys = Object.keys(obj || {})
        if (keys.length > 0) setAllowedApiUrls((prev) => Array.from(new Set(prev.concat(keys))))
      }
    } catch (e) {}
  }, [])

  // 在 ReviewForm 提交成功时调用以保存自定义配对
  function handleSavePair(api: string, modelName: string) {
    try {
      const raw = localStorage.getItem('savedApiModelPairs')
      const obj = raw ? JSON.parse(raw) as Record<string,string> : {}
      obj[api] = modelName
      localStorage.setItem('savedApiModelPairs', JSON.stringify(obj))
      setAllowedApiUrls((prev) => Array.from(new Set(prev.concat([api]))))
    } catch (e) {}
  }

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme)
      if (theme === 'dark') document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    } catch (e) {}
  }, [theme])

  // 中文注释：拉取最近会话清单
  async function fetchSessionList(agentId?: string) {
    try {
      const aid = agentId || activeTab
      const agent = AGENTS.find(a => a.id === aid) || AGENTS[0]
      const res = await fetch(`${agent.baseUrl}/sessions/list?limit=10`)
      if (!res.ok) throw new Error(await res.text())
      const j = await res.json()
      setSessionListMap((m) => ({ ...m, [aid]: Array.isArray(j.items) ? j.items : [] }))
    } catch (e) {
      // 静默失败，不影响主流程
    }
  }

  useEffect(() => {
    if (sessionsVisible) fetchSessionList()
  }, [sessionsVisible])

  // 中文注释：应用加载的会话到当前界面
  function applyLoadedSessionToUI(s: SessionFileV1) {
    try {
      const url = s.apiUrl || ''
      const inAllowed = allowedApiUrls.includes(url)
      // API 地址回填：不在白名单则切换为自定义
      if (inAllowed) {
        setModelApiUrl(url)
        setCustomApiUrl('')
      } else {
        setModelApiUrl('custom')
        setCustomApiUrl(url)
      }

      // 模型名回填：OpenRouter 或自定义优先 customModelName，否则使用下拉模型
      const isOpenRouter = (url || '').startsWith('https://openrouter.ai')
      const loadedModel = (s.customModelName && s.customModelName.trim()) ? s.customModelName.trim() : (s.model || '')
      if (isOpenRouter) {
        // 若模型在预设下拉中，优先使用下拉；否则设置为自定义选项
        const preset = OPENROUTER_MODEL_PRESETS.includes(loadedModel)
        if (preset) {
          setModel(loadedModel)
          setCustomModelName('')
        } else {
          setModel('custom')
          setCustomModelName(loadedModel)
        }
      } else if (!inAllowed) {
        // 自定义 API：若模型在默认下拉里则用下拉，否则自定义
        const inDefault = DEFAULT_MODEL_PRESETS.includes(loadedModel)
        if (inDefault) {
          setModel(loadedModel)
          setCustomModelName('')
        } else {
          setCustomModelName(loadedModel)
        }
      } else {
        // 受支持的已知地址：直接用下拉模型
        setModel(s.model || '')
        setCustomModelName('')
      }

      // 评审结果与结构化数据 - 按 agent 隔离存储
      setMarkdownMap((m) => ({ ...m, [activeTab]: s.markdown || '' }))
      setEnrichedJsonMap((m) => ({ ...m, [activeTab]: s.enrichedJson || null }))
      setOverlayMap((m) => ({ ...m, [activeTab]: s.overlay || null }))

      // 给子组件的种子数据（按 agent 存储）
      setSessionSeedMap((m) => ({
        ...m,
        [activeTab]: {
          requirements: s.requirements || '',
          specs: s.specs || '',
          // questionConfirm 字段已移除，使用 history 存储用户与 assistant 条目
          dialog: s.dialog || '',
          history: Array.isArray(s.history) ? s.history : [],
          timeline: Array.isArray(s.timeline) ? s.timeline : [],
          files: Array.isArray(s.files) ? s.files : [],
          enrichedJson: s.enrichedJson,
        },
      }))
      // 不改变 activeTab（保留用户当前选中）
    } catch (e) {
      // 忽略映射异常，避免影响主流程
    }
  }

  async function handleLoadSession(id: string) {
    try {
      const agent = AGENTS.find(a => a.id === activeTab) || AGENTS[0]
      const res = await fetch(`${agent.baseUrl}/sessions/${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(await res.text())
      const s = await res.json() as SessionFileV1
      applyLoadedSessionToUI(s)
    } catch (e: any) {
      alert('加载会话失败：' + (e?.message || ''))
    }
  }

  async function handleDeleteSession(id: string) {
    try {
      const agent = AGENTS.find(a => a.id === activeTab) || AGENTS[0]
      const res = await fetch(`${agent.baseUrl}/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      await fetchSessionList()
    } catch (e: any) {
      alert('删除会话失败：' + (e?.message || ''))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-cursorBlack p-6">
      {/* 顶部全宽页眉：左侧放置 logo 与双行标题（英/中），右侧放置语言与主题按钮 */}
      <div className="w-full mb-4 border-b dark:border-cursorBorder bg-white dark:bg-cursorPanel">
        <div className="max-w-6xl mx-auto p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* 内联 SVG Logo（可替换为真实图片） */}
              <div className="w-10 h-10 rounded overflow-hidden bg-white flex items-center justify-center">
                {/* 使用前端本地静态 logo 文件 */}
                <img src="/logo.png" alt="ReviewAI logo" className="w-10 h-10 object-cover" />
              </div>
              <div className="leading-tight">
                <div className="text-xl font-semibold text-gray-400">{t('app.brand.title_en')}</div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-600 dark:text-gray-300">{t('app.brand.title_cn')}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">v0.2.24</div>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">联系作者：<a href="mailto:gyrych@gmail.com" className="underline text-sm text-gray-600 dark:text-gray-300">gyrych@gmail.com</a></div>
              </div>
            </div>
              <div className="flex items-center justify-end gap-2">
              <select value={model} onChange={(e) => setModel(e.target.value)} className="px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-sm">
                {modelOptions.map((m) => (<option key={m} value={m}>{m === 'custom' ? t('app.modelName.option.custom') : m}</option>))}
              </select>
              <input value={apiKey} onChange={(e) => { const v = e.target.value; setApiKey(v); try { localStorage.setItem('apiKey', v) } catch(e){} }} placeholder={t('app.apiKey.placeholder') || 'API Key'} title={t('app.apiKey.hint') || '输入 API Key'} className="px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-sm" />
              <button
                onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                className="px-3 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-sm transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {t('app.lang.toggle')}
              </button>
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="px-3 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-sm transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {theme === 'light' ? t('app.theme.toDark') : t('app.theme.toLight')}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto grid grid-cols-12 gap-6">
        <div className="col-span-5 bg-white dark:bg-cursorPanel p-4 rounded shadow glass-soft">

          {/* App 级设置已移至标题栏（右侧），此处不再展示 API URL */}

          {/* 会话管理改为 Agent 层，App 层不在此处渲染会话列表 */}

          <div>
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                {AGENTS.map((ag) => (
                  <button key={ag.id} onClick={() => setActiveTab(ag.id as any)} className={`px-3 py-2 ${activeTab === ag.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>
                    {ag.label}
                  </button>
                ))}
                {/* 其余标签页已移除 */}
              </nav>
            </div>
            <div className="mt-4">
              {(activeTab === 'circuit' || activeTab === 'circuit-fine') && (
                (() => {
                  const ag = AGENTS.find(a => a.id === activeTab) || AGENTS[0]
                  const Component = activeTab === 'circuit' ? CircuitReviewForm : CircuitFineReviewForm
                  return (
                  <Component
                      agentBaseUrl={ag.baseUrl}
                      onResult={(md: string) => setMarkdownMap((m) => ({ ...m, [activeTab]: md }))}
                      setEnrichedJson={(j: any) => setEnrichedJsonMap((m) => ({ ...m, [activeTab]: j }))}
                      setOverlay={(o: any) => setOverlayMap((m) => ({ ...m, [activeTab]: o }))}
                      overlay={overlayMap[activeTab]}
                      modelApiUrl={modelApiUrl}
                      customApiUrl={customApiUrl}
                      model={model}
                      customModelName={customModelName}
                      setCustomModelName={setCustomModelName}
                      apiKey={apiKey}
                      allowedApiUrls={allowedApiUrls}
                      onSavePair={handleSavePair}
                      markdown={markdownMap[activeTab]}
                      sessionSeed={sessionSeedMap[activeTab] || undefined}
                      onTimeline={(tl: any) => setLiveTimelineMap((m) => ({ ...m, [activeTab]: Array.isArray(tl) ? tl : undefined }))}
                      onLoadSession={handleLoadSession}
                    />
                  )
                })()
              )}
              {/* 已移除的非电路标签页相关内容 */}
            </div>
          </div>
        </div>
        <div className="col-span-7">
          <h2 className="text-lg font-semibold mb-4 dark:text-cursorText">{t('app.result.title')}</h2>
          <ResultView markdown={markdownMap[activeTab] || t('app.result.waiting')} enrichedJson={enrichedJsonMap[activeTab]} overlay={overlayMap[activeTab]} setEnrichedJson={(j:any)=>setEnrichedJsonMap((m)=>({...m,[activeTab]:j}))} timeline={liveTimelineMap[activeTab] || (sessionSeedMap[activeTab] && (sessionSeedMap[activeTab] as any).timeline ? (sessionSeedMap[activeTab] as any).timeline : undefined)} />
        </div>
      </div>
    </div>
  )
}


