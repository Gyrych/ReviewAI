import React, { useRef, useState } from 'react'
import ReviewForm from '../../components/ReviewForm'
import { useI18n } from '../../i18n'
// 电路图单agent评审（initialMode: direct），Agent 层渲染会话操作按钮并显示会话列表 modal
export default function CircuitReviewForm(props: any) {
  const ref = useRef<any>(null)
  const [listVisible, setListVisible] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const { t } = useI18n() as any

  async function handleSave() {
    try {
      if (ref.current && typeof ref.current.saveSession === 'function') {
        await ref.current.saveSession()
      }
    } catch (e: any) {
      try { alert(t('form.save.fail', { msg: e?.message || String(e) })) } catch { alert('保存会话失败') }
    }
  }

  async function openSessionList() {
    try {
      const base = props.agentBaseUrl || '/api/v1/circuit-agent'
      const res = await fetch(`${base}/sessions/list?limit=50`)
      if (!res.ok) throw new Error(await res.text())
      const j = await res.json()
      setSessions(Array.isArray(j.items) ? j.items : [])
      setListVisible(true)
    } catch (e: any) {
      alert('加载会话列表失败：' + (e?.message || ''))
    }
  }

  async function loadById(id: string) {
    try {
      if (typeof props.onLoadSession === 'function') {
        await props.onLoadSession(id)
      } else {
        const base = props.agentBaseUrl || '/api/v1/circuit-agent'
        const res = await fetch(`${base}/sessions/${encodeURIComponent(id)}`)
        if (!res.ok) throw new Error(await res.text())
        const s = await res.json()
        try { if (typeof props.onResult === 'function') props.onResult(s.markdown || '') } catch (e: any) {}
        try { if (typeof props.setEnrichedJson === 'function') props.setEnrichedJson(s.enrichedJson || null) } catch (e: any) {}
      }
    } catch (e: any) {
      alert('加载会话失败：' + (e?.message || ''))
    } finally {
      setListVisible(false)
    }
  }

  async function deleteSession(id: string) {
    try {
      const base = props.agentBaseUrl || '/api/v1/circuit-agent'
      const res = await fetch(`${base}/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      setSessions((s) => s.filter((it) => it.id !== id))
    } catch (e: any) {
      alert('删除会话失败：' + (e?.message || ''))
    }
  }

  return (
    <div className="relative">
      <div className="mb-2 flex gap-2">
        <button onClick={() => handleSave()} className="px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-sm">{t('form.save')}</button>
        <button onClick={() => openSessionList()} className="px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-sm">{t('app.sessions.load')}</button>
      </div>

      {listVisible && (
        <>
          {/* 背景遮罩 */}
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setListVisible(false)} />
          {/* 弹出窗口：定位在按钮下方 */}
          <div className="absolute left-0 top-12 z-50 w-[400px] max-w-[90vw]">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl border-2 border-gray-300 dark:border-gray-600 p-4 max-h-[500px] overflow-y-auto">
              <div className="flex justify-between items-center mb-3 border-b-2 pb-2 border-gray-300 dark:border-gray-600">
                <div className="font-bold text-base text-black dark:text-white">{t('app.sessions.list')}</div>
                <button onClick={() => setListVisible(false)} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">{t('common.close')}</button>
              </div>
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-gray-600 dark:text-gray-300 font-medium">暂无会话</div>
              ) : (
                <ul className="space-y-3">
                  {sessions.map((it: any) => (
                    <li key={it.id} className="flex flex-col gap-2 border-b-2 border-gray-200 dark:border-gray-700 pb-3 last:border-b-0">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-black dark:text-white truncate">{it.createdAt}</div>
                        <div className="text-xs text-gray-700 dark:text-gray-300 truncate mt-1">{it.apiHost} · {it.model || ''}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => loadById(it.id)} className="flex-1 px-3 py-1.5 text-xs font-medium rounded border-2 border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800">{t('app.sessions.load')}</button>
                        <button onClick={() => deleteSession(it.id)} className="flex-1 px-3 py-1.5 text-xs font-medium rounded border-2 border-red-600 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-800">{t('app.sessions.delete')}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      <ReviewForm ref={ref} {...props} initialMode="direct" />
    </div>
  )
}


