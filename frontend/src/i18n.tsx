import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

// 中文注释：轻量级国际化实现，不引入第三方依赖

export type Lang = 'zh' | 'en'

type I18nContextType = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang') as Lang | null
    if (saved === 'zh' || saved === 'en') return saved
  } catch {}
  try {
    const navLangs: string[] = (navigator as any).languages || []
    const navPrimary: string = (navigator as any).language || ''
    const all = (navLangs && navLangs.length > 0) ? navLangs : [navPrimary]
    const matchZh = all.some((l) => typeof l === 'string' && l.toLowerCase().includes('zh'))
    return matchZh ? 'zh' : 'en'
  } catch {}
  return 'zh'
}

// 中文注释：翻译字典
const dictZh: Record<string, string> = {
  // app 层
  'app.title': '仪器研究',
  'app.theme.toDark': '切换暗色',
  'app.theme.toLight': '切换亮色',
  'app.lang.toggle': 'EN/中',
  'app.modelApi.label': '模型 API 地址',
  'app.modelApi.option.custom': '自定义（输入其它 API 地址）',
  'app.modelApi.placeholder.customUrl': 'https://your-api.example.com/path',
  'app.modelName.label': '模型名称',
  'app.modelName.option.custom': '自定义（输入模型名称）',
  'app.modelName.placeholder.customName': '自定义模型名称（例如 my-custom-model）',
  'app.modelName.note.customApi': '已选择自定义 API：请在此处输入模型名称，输入后将作为提交时的模型名；下拉已冻结。',
  'app.modelName.note.openrouter': '已选择 OpenRouter：可填写自定义模型名称，填写后将作为提交时的模型名；若留空，将使用下拉默认模型。',
  'app.apiKey.label': 'API Key',
  'app.sessions.toggle.show': '加载会话',
  'app.sessions.toggle.hide': '隐藏会话',
  'app.sessions.refresh': '刷新',
  'app.sessions.empty': '暂无会话，点击右侧刷新重试。',
  'app.sessions.load': '加载',
  'app.sessions.delete': '删除',
  'app.tabs.circuit': '电路评审',
  'app.tabs.code': '代码评审',
  'app.tabs.doc': '文档评审',
  'app.tabs.req': '需求评审',
  'app.tab.todo': '（待开发）',
  'app.result.title': '评审结果',
  'app.result.waiting': '等待提交结果...',
  'app.error.loadSession': '加载会话失败：{msg}',
  'app.error.deleteSession': '删除会话失败：{msg}',

  // ReviewForm 层
  'form.upload.label': '文件上传',
  'form.req.label': '设计需求（系统提示）',
  'form.spec.label': '设计规范（系统提示）',
  'form.qc.label': '问题确认（模型反馈）',
  'form.qc.placeholder': '模型返回的问题或疑问将显示在此（按页显示）',
  'form.dialog.label': '对话（与模型交互）',
  'form.dialog.placeholder.editable': '输入与大模型的对话/问题（与当前页对应）',
  'form.dialog.placeholder.readonly': '非最后一页只读：聚焦将自动跳到最后一页以编辑',
  'form.paging.current': '第 {page} / {total} 页',
  'form.paging.prev': '上一页',
  'form.paging.next': '下一页',
  'form.progress.current': '当前步骤：{step}',
  'form.progress.elapsed': '已用时：{seconds}s',
  'form.submit.loading': '提交中...',
  'form.submit': '提交',
  'form.reset': '重置',
  'form.save.loading': '保存中...',
  'form.save': '保存会话',
  'form.save.ok': '会话已保存',
  'form.save.fail': '保存会话失败：{msg}',
  'form.reset.confirm': '当前会话有未保存内容，是否先保存？',
  'form.customApi.warning': '提示：您使用的是自定义或未知的 API 地址，系统不会验证其可用性。若上游返回错误，请检查地址或切换到下拉中的受支持地址。',
  'form.error.timeout': '请求超时：上游响应较慢或网络不稳定，请尝试切换为 /beta 路径或稍后重试。',
  'form.error.submitFail': '提交失败',

  // 步骤标签
  'step_idle': '空闲',
  'step_preparing': '准备中',
  'step_uploading_files': '上传文件',
  'step_using_cached_enriched_json': '使用已解析数据',
  'step_sending_request': '发送请求',
  'step_done': '完成',
  'step_images_processing_start': '图像处理 - 开始',
  'step_images_processing_done': '图像处理 - 完成',
  'step_llm_request_start': '调用模型 - 开始',
  'step_llm_request_done': '调用模型 - 完成',

  // FileUpload 层
  'upload.select': '选择文件',
  'upload.selected': '已选 {count} / {max}',
  'upload.remove': '移除',

  // ResultView 层
  'overlay.mapping.entries': 'Overlay 映射条目：{count}',
  'overlay.enrichedJson.title': '结构化描述（enrichedJson）',

  // 通用/告警
  'warning.noSystemPrompt': '当前运行在无系统提示词环境下，输出质量与一致性无法保证。请在仓库根目录添加或完善系统提示词文件。',
  'common.close': '关闭',
}

const dictEn: Record<string, string> = {
  // app layer
  'app.title': 'Schematic Review',
  'app.theme.toDark': 'Dark Mode',
  'app.theme.toLight': 'Light Mode',
  'app.lang.toggle': 'EN/中',
  'app.modelApi.label': 'Model API URL',
  'app.modelApi.option.custom': 'Custom (enter API URL)',
  'app.modelApi.placeholder.customUrl': 'https://your-api.example.com/path',
  'app.modelName.label': 'Model Name',
  'app.modelName.option.custom': 'Custom (enter model name)',
  'app.modelName.placeholder.customName': 'Custom model name (e.g. my-custom-model)',
  'app.modelName.note.customApi': 'Custom API selected: please input a model name; the dropdown is frozen.',
  'app.modelName.note.openrouter': 'OpenRouter selected: you may enter a custom model name; if empty, the dropdown model will be used.',
  'app.apiKey.label': 'API Key',
  'app.sessions.toggle.show': 'Load Sessions',
  'app.sessions.toggle.hide': 'Hide Sessions',
  'app.sessions.refresh': 'Refresh',
  'app.sessions.empty': 'No sessions. Click Refresh to retry.',
  'app.sessions.load': 'Load',
  'app.sessions.delete': 'Delete',
  'app.tabs.circuit': 'Circuit Review',
  'app.tabs.code': 'Code Review',
  'app.tabs.doc': 'Doc Review',
  'app.tabs.req': 'Requirements Review',
  'app.tab.todo': '(TBD)',
  'app.result.title': 'Results',
  'app.result.waiting': 'Waiting for result...',
  'app.error.loadSession': 'Failed to load session: {msg}',
  'app.error.deleteSession': 'Failed to delete session: {msg}',

  // ReviewForm layer
  'form.upload.label': 'File Upload',
  'form.req.label': 'Requirements (system prompt)',
  'form.spec.label': 'Specs (system prompt)',
  'form.qc.label': 'Question Confirm (model feedback)',
  'form.qc.placeholder': 'Questions or clarifications from the model will show here (paged).',
  'form.dialog.label': 'Dialog (LLM)',
  'form.dialog.placeholder.editable': 'Enter your message to the model (for current page)',
  'form.dialog.placeholder.readonly': 'Read-only on non-last page: focusing will jump to the last page for editing',
  'form.paging.current': 'Page {page} / {total}',
  'form.paging.prev': 'Prev',
  'form.paging.next': 'Next',
  'form.progress.current': 'Current step: {step}',
  'form.progress.elapsed': 'Elapsed: {seconds}s',
  'form.submit.loading': 'Submitting...',
  'form.submit': 'Submit',
  'form.reset': 'Reset',
  'form.save.loading': 'Saving...',
  'form.save': 'Save Session',
  'form.save.ok': 'Session saved',
  'form.save.fail': 'Failed to save session: {msg}',
  'form.reset.confirm': 'There are unsaved changes. Save first?',
  'form.customApi.warning': 'Warning: You are using a custom/unknown API URL. The system will not validate its availability. If errors occur, check the URL or switch to a supported one.',
  'form.error.timeout': 'Request timed out: upstream is slow or network unstable. Try /beta path or retry later.',
  'form.error.submitFail': 'Submit failed',

  // steps
  'step_idle': 'Idle',
  'step_preparing': 'Preparing',
  'step_uploading_files': 'Uploading files',
  'step_using_cached_enriched_json': 'Using parsed data',
  'step_sending_request': 'Sending request',
  'step_done': 'Done',
  'step_images_processing_start': 'Image processing - start',
  'step_images_processing_done': 'Image processing - done',
  'step_llm_request_start': 'LLM request - start',
  'step_llm_request_done': 'LLM request - done',

  // FileUpload
  'upload.select': 'Select Files',
  'upload.selected': 'Selected {count} / {max}',
  'upload.remove': 'Remove',

  // ResultView
  'overlay.mapping.entries': 'Overlay mapping entries: {count}',
  'overlay.enrichedJson.title': 'Structured description (enrichedJson)',

  // Common/Warnings
  'warning.noSystemPrompt': 'Running without a system prompt; output quality and consistency cannot be guaranteed. Please add a system prompt file at the repository root.',
  'common.close': 'Close',
}

const DICTS: Record<Lang, Record<string, string>> = { zh: dictZh, en: dictEn }

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(.*?)\}/g, (_, k) => {
    const v = params[k]
    return (v === undefined || v === null) ? '' : String(v)
  })
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang())

  // 中文注释：同步 <html lang> 与本地存储
  useEffect(() => {
    try { localStorage.setItem('lang', lang) } catch {}
    try { document.documentElement.setAttribute('lang', lang) } catch {}
  }, [lang])

  const setLang = (l: Lang) => setLangState(l)

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>) => {
      const d = DICTS[lang] || dictZh
      let template = d[key]
      if (!template) {
        template = (dictZh as any)[key] || key
        try { console.warn('[i18n] Missing key:', key) } catch {}
      }
      return interpolate(template, params)
    }
  }, [lang])

  const value = useMemo<I18nContextType>(() => ({ lang, setLang, t }), [lang, t])

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}


