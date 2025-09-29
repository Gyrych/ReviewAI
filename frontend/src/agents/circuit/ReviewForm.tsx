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
    <div>
      <div className="mb-2 flex gap-2">
        <button onClick={() => handleSave()} className="px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-sm">{t('form.save')}</button>
        <button onClick={() => openSessionList()} className="px-2 py-1 rounded border bg-white dark:bg-cursorPanel dark:text-cursorText dark:border-cursorBorder text-sm">{t('app.sessions.load')}</button>
      </div>

      {listVisible && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-cursorPanel rounded p-4 w-3/4 max-h-3/4 overflow-y-auto text-gray-900 dark:text-gray-100">
            <div className="flex justify-between items-center mb-2">
              <div className="font-medium">{t('app.sessions.list')}</div>
              <button onClick={() => setListVisible(false)} className="text-sm">{t('common.close')}</button>
            </div>
            <ul className="space-y-2">
              {sessions.map((it: any) => (
                <li key={it.id} className="flex items-center justify-between border-b pb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium dark:text-cursorText truncate">{it.createdAt}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 truncate">{it.apiHost} · {it.model || ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => loadById(it.id)} className="px-2 py-1 text-xs rounded border">{t('app.sessions.load')}</button>
                    <button onClick={() => deleteSession(it.id)} className="px-2 py-1 text-xs rounded border text-red-600">{t('app.sessions.delete')}</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ReviewForm ref={ref} {...props} initialMode="direct" />
    </div>
  )
}


