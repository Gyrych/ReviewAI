import React, { useState, useEffect } from 'react'
import ReviewForm from './components/ReviewForm'
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
  const [markdown, setMarkdown] = useState('')
  const [enrichedJson, setEnrichedJson] = useState<any | null>(null)
  const [overlay, setOverlay] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<'circuit' | 'code' | 'doc' | 'req'>('circuit')
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
  const [apiKey, setApiKey] = useState<string>('')
  // 中文注释：会话加载相关状态
  const [sessionsVisible, setSessionsVisible] = useState<boolean>(false)
  const [sessionList, setSessionList] = useState<SessionListItem[]>([])
  const [sessionSeed, setSessionSeed] = useState<SessionSeed | null>(null)
  // 新增：实时 timeline 状态，用于 ResultView 在没有 sessionSeed 时展示最近一次的 timeline
  const [liveTimeline, setLiveTimeline] = useState<{ step: string; ts?: number; meta?: any }[] | undefined>(undefined)

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
  async function fetchSessionList() {
    try {
      const res = await fetch('/api/v1/circuit-agent/sessions/list?limit=10')
      if (!res.ok) throw new Error(await res.text())
      const j = await res.json()
      setSessionList(Array.isArray(j.items) ? j.items : [])
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

      // 评审结果与结构化数据
      setMarkdown(s.markdown || '')
      setEnrichedJson(s.enrichedJson || null)
      setOverlay(s.overlay || null)

      // 给子组件的种子数据
      setSessionSeed({
        requirements: s.requirements || '',
        specs: s.specs || '',
        questionConfirm: s.questionConfirm || '',
        dialog: s.dialog || '',
        history: Array.isArray(s.history) ? s.history : [],
        timeline: Array.isArray(s.timeline) ? s.timeline : [],
        files: Array.isArray(s.files) ? s.files : [],
        enrichedJson: s.enrichedJson,
      })
      setActiveTab('circuit')
    } catch (e) {
      // 忽略映射异常，避免影响主流程
    }
  }

  async function handleLoadSession(id: string) {
    try {
      const res = await fetch(`/api/v1/circuit-agent/sessions/${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(await res.text())
      const s = await res.json() as SessionFileV1
      applyLoadedSessionToUI(s)
    } catch (e: any) {
      alert('加载会话失败：' + (e?.message || ''))
    }
  }

  async function handleDeleteSession(id: string) {
    try {
      const res = await fetch(`/api/v1/circuit-agent/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
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
                <img src="/logo.png" alt="Review AI logo" className="w-10 h-10 object-cover" />
              </div>
              <div className="leading-tight">
                <div className="text-xl font-semibold text-gray-400">{t('app.brand.title_en')}</div>
                <div className="text-sm text-gray-600 dark:text-gray-300">{t('app.brand.title_cn')}</div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
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
        <div className="col-span-5 bg-white dark:bg-cursorPanel p-4 rounded shadow">

          {/* 全局配置区域：模型 API 地址、模型名称、API Key 等 */}
          <div className="mb-4">
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('app.modelApi.label')}</label>
                <input value={OPENROUTER_API_URL} readOnly className="mt-1 block w-full rounded-md border px-3 py-2 bg-gray-100 dark:bg-gray-800 dark:border-cursorBorder dark:text-gray-300" />
                <p className="text-xs text-gray-500 mt-1">{t('app.modelApi.note.fixed') || 'Using OpenRouter (fixed)'}: {OPENROUTER_API_URL}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('app.modelName.label')}</label>
                {modelApiUrl === 'custom' ? (
                  <>
                    <select className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" value="custom" disabled>
                      <option value="custom">{t('app.modelName.option.custom')}</option>
                    </select>
                    <div className="mt-2">
                      <input value={customModelName} onChange={(e) => setCustomModelName(e.target.value)} placeholder={t('app.modelName.placeholder.customName')} className="block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" />
                      <p className="text-xs text-yellow-600 mt-1">{t('app.modelName.note.customApi')}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText">
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>{m === 'custom' ? t('app.modelName.option.custom') : m}</option>
                      ))}
                    </select>
                    {modelApiUrl === OPENROUTER_API_URL && model === 'custom' && (
                      <div className="mt-2">
                        <input value={customModelName} onChange={(e) => setCustomModelName(e.target.value)} placeholder={t('app.modelName.placeholder.customName')} className="block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" />
                        <p className="text-xs text-yellow-600 mt-1">{t('app.modelName.note.openrouter')}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t('app.apiKey.label')}</label>
                <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder dark:text-cursorText" />
              </div>
            </div>
          </div>

          {/* 加载会话：按钮与滚动清单（最多 10 条） */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setSessionsVisible(!sessionsVisible)} className="px-3 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-sm transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {sessionsVisible ? t('app.sessions.toggle.hide') : t('app.sessions.toggle.show')}
              </button>
              {sessionsVisible && (
                <button onClick={() => fetchSessionList()} className="px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-xs transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {t('app.sessions.refresh')}
                </button>
              )}
            </div>
            {sessionsVisible && (
              <div className="mt-2 border rounded p-2 max-h-64 overflow-y-auto bg-white dark:bg-cursorPanel dark:border-cursorBorder">
                {sessionList.length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-300">{t('app.sessions.empty')}</div>
                )}
                <ul className="space-y-2">
                  {sessionList.map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium dark:text-cursorText truncate">{it.createdAt}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-300 truncate">{it.apiHost} · {it.model || ''}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleLoadSession(it.id)} className="px-2 py-1 text-xs rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">{t('app.sessions.load')}</button>
                        <button onClick={() => handleDeleteSession(it.id)} className="px-2 py-1 text-xs rounded border bg-white dark:bg-cursorPanel dark:border-cursorBorder text-red-600 dark:text-red-400 transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">{t('app.sessions.delete')}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                <button onClick={() => setActiveTab('circuit')} className={`px-3 py-2 ${activeTab === 'circuit' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>
                  {t('app.tabs.circuit')}
                </button>
                <button onClick={() => setActiveTab('code')} className={`px-3 py-2 ${activeTab === 'code' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>
                  {t('app.tabs.code')}
                </button>
                <button onClick={() => setActiveTab('doc')} className={`px-3 py-2 ${activeTab === 'doc' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>
                  {t('app.tabs.doc')}
                </button>
                <button onClick={() => setActiveTab('req')} className={`px-3 py-2 ${activeTab === 'req' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>
                  {t('app.tabs.req')}
                </button>
              </nav>
            </div>
            <div className="mt-4">
              {activeTab === 'circuit' && (
                <ReviewForm
                  onResult={setMarkdown}
                  setEnrichedJson={setEnrichedJson}
                  setOverlay={setOverlay}
                  overlay={overlay}
                  modelApiUrl={modelApiUrl}
                  customApiUrl={customApiUrl}
                  model={model}
                  customModelName={customModelName}
                  setCustomModelName={setCustomModelName}
                  apiKey={apiKey}
                  allowedApiUrls={allowedApiUrls}
                  onSavePair={handleSavePair}
                  markdown={markdown}
                  sessionSeed={sessionSeed || undefined}
                  // 传入回调以接收 ReviewForm 合并后的 timeline
                  onTimeline={(tl) => setLiveTimeline(Array.isArray(tl) ? tl : undefined)}
                />
              )}
              {activeTab === 'code' && (
                <div className="text-gray-500">{t('app.tabs.code')}{t('app.tab.todo')}</div>
              )}
              {activeTab === 'doc' && (
                <div className="text-gray-500">{t('app.tabs.doc')}{t('app.tab.todo')}</div>
              )}
              {activeTab === 'req' && (
                <div className="text-gray-500">{t('app.tabs.req')}{t('app.tab.todo')}</div>
              )}
            </div>
          </div>
        </div>
        <div className="col-span-7">
          <h2 className="text-lg font-semibold mb-4 dark:text-cursorText">{t('app.result.title')}</h2>
          <ResultView markdown={markdown || t('app.result.waiting')} enrichedJson={enrichedJson} overlay={overlay} setEnrichedJson={setEnrichedJson} timeline={liveTimeline || (sessionSeed && (sessionSeed as any).timeline ? (sessionSeed as any).timeline : undefined)} />
        </div>
      </div>
    </div>
  )
}


