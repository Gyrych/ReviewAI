import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tailwind.css'
import { I18nProvider } from './i18n'
import { checkPromptHealth } from './utils/promptCheck'

// 在开发模式下执行提示词健康检查，避免在生产环境造成额外请求
if ((import.meta as any).env && (import.meta as any).env.DEV) {
  checkPromptHealth('zh').then((r) => {
    console.log('[promptCheck]', r.ok ? 'ok' : 'failed', r)
  }).catch(() => {})
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
)


