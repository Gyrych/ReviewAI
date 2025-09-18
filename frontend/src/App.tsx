import React, { useState, useEffect } from 'react'
import ReviewForm from './components/ReviewForm'
import ResultView from './components/ResultView'

export default function App() {
  const [markdown, setMarkdown] = useState('')
  const [enrichedJson, setEnrichedJson] = useState<any | null>(null)
  const [overlay, setOverlay] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<'circuit' | 'code' | 'doc' | 'req'>('circuit')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('theme') as 'light' | 'dark') || 'light' } catch(e){ return 'light' }
  })

  // 公共配置：模型 API、模型名、API Key 等，抽离到 App 级别保持跨选项卡不变
  const DEFAULT_API_URLS = [
    'https://api.deepseek.com/chat/completions',
    'https://openrouter.ai/api/v1/chat/completions',
  ]
  const [allowedApiUrls, setAllowedApiUrls] = useState<string[]>(DEFAULT_API_URLS)
  const [modelApiUrl, setModelApiUrl] = useState<string>(DEFAULT_API_URLS[0])
  const [customApiUrl, setCustomApiUrl] = useState<string>('')
  const [model, setModel] = useState<string>('deepseek-chat')
  const [customModelName, setCustomModelName] = useState<string>('')
  const [modelOptions, setModelOptions] = useState<string[]>(['deepseek-chat', 'deepseek-reasoner'])
  const [apiKey, setApiKey] = useState<string>('')

  // 根据选中的 API 自动切换可选模型列表（OpenRouter 使用特定候选）
  useEffect(() => {
    try {
      const urlForCheck = modelApiUrl === 'custom' ? (customApiUrl || '') : modelApiUrl
      if ((urlForCheck || '').startsWith('https://openrouter.ai')) {
        const openRouterModels = [
          'openai/gpt-5',
          'openai/gpt-5-mini',
          'openai/gpt-5-nano',
          'google/gemini-2.5-pro',
          'google/gemini-2.5-flash',
          'x-ai/grok-4',
          'qwen/qwen2.5-vl-32b-instruct',
          'qwen/qwen2.5-vl-32b-instruct:free',
        ]
        setModelOptions(openRouterModels)
        if (!openRouterModels.includes(model)) setModel(openRouterModels[0])
      } else {
        const defaults = ['deepseek-chat', 'deepseek-reasoner']
        setModelOptions(defaults)
        if (!defaults.includes(model)) setModel(defaults[0])
      }
    } catch (e) {}
  }, [modelApiUrl, customApiUrl])

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-12 gap-6">
        <div className="col-span-5 bg-white dark:bg-gray-800 p-4 rounded shadow relative">
          <h2 className="text-3xl font-bold mb-4 text-center">仪器研究部</h2>

          {/* 主题切换按钮（右上角） */}
          <div className="absolute top-3 right-3">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="px-3 py-1 rounded border bg-gray-100 dark:bg-gray-700 text-sm"
            >
              {theme === 'light' ? '切换暗色' : '切换亮色'}
            </button>
          </div>

          {/* 全局配置区域：模型 API 地址、模型名称、API Key 等 */}
          <div className="mb-4">
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">模型 API 地址</label>
                <select value={modelApiUrl} onChange={(e) => setModelApiUrl(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                  {allowedApiUrls.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                  <option value="custom">自定义（输入其它 API 地址）</option>
                </select>
                {modelApiUrl === 'custom' && (
                  <div className="mt-2">
                    <input value={customApiUrl} onChange={(e) => setCustomApiUrl(e.target.value)} placeholder="https://your-api.example.com/path" className="block w-full rounded-md border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">模型名称</label>
                {modelApiUrl === 'custom' ? (
                  <>
                    <select className="mt-1 block w-full rounded-md border px-3 py-2" value="custom" disabled>
                      <option value="custom">自定义（输入模型名称）</option>
                    </select>
                    <div className="mt-2">
                      <input value={customModelName} onChange={(e) => setCustomModelName(e.target.value)} placeholder="自定义模型名称（例如 my-custom-model）" className="block w-full rounded-md border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
                      <p className="text-xs text-yellow-600 mt-1">已选择自定义 API：请在此处输入模型名称，输入后将作为提交时的模型名；下拉已冻结。</p>
                    </div>
                  </>
                ) : (
                  <>
                    <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    {( (modelApiUrl === 'custom' && (customApiUrl || '').startsWith('https://openrouter.ai')) || modelApiUrl === DEFAULT_API_URLS[1]) && (
                      <div className="mt-2">
                        <input value={customModelName} onChange={(e) => setCustomModelName(e.target.value)} placeholder="自定义模型名称（例如 my-custom-model）" className="block w-full rounded-md border px-3 py-2" />
                        <p className="text-xs text-yellow-600 mt-1">已选择 OpenRouter：可填写自定义模型名称，填写后将作为提交时的模型名；若留空，将使用下拉默认模型。</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">API Key</label>
                <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              </div>
            </div>
          </div>

          <div>
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                <button onClick={() => setActiveTab('circuit')} className={`px-3 py-2 ${activeTab === 'circuit' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>
                  电路评审
                </button>
                <button onClick={() => setActiveTab('code')} className={`px-3 py-2 ${activeTab === 'code' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>
                  代码评审
                </button>
                <button onClick={() => setActiveTab('doc')} className={`px-3 py-2 ${activeTab === 'doc' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>
                  文档评审
                </button>
                <button onClick={() => setActiveTab('req')} className={`px-3 py-2 ${activeTab === 'req' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}>
                  需求评审
                </button>
              </nav>
            </div>
            <div className="mt-4">
              {activeTab === 'circuit' && (
                <ReviewForm
                  onResult={setMarkdown}
                  setEnrichedJson={setEnrichedJson}
                  setOverlay={setOverlay}
                  modelApiUrl={modelApiUrl}
                  customApiUrl={customApiUrl}
                  model={model}
                  customModelName={customModelName}
                  setCustomModelName={setCustomModelName}
                  apiKey={apiKey}
                  allowedApiUrls={allowedApiUrls}
                  onSavePair={handleSavePair}
                />
              )}
              {activeTab === 'code' && (
                <div className="text-gray-500">代码评审（待开发）</div>
              )}
              {activeTab === 'doc' && (
                <div className="text-gray-500">文档评审（待开发）</div>
              )}
              {activeTab === 'req' && (
                <div className="text-gray-500">需求评审（待开发）</div>
              )}
            </div>
          </div>
        </div>
        <div className="col-span-7">
          <h2 className="text-lg font-semibold mb-4">评审结果</h2>
          <ResultView markdown={markdown || '等待提交结果...'} enrichedJson={enrichedJson} overlay={overlay} setEnrichedJson={setEnrichedJson} />
        </div>
      </div>
    </div>
  )
}


