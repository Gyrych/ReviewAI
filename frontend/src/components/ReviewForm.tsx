import React, { useState } from 'react'
import FileUpload from './FileUpload'

export default function ReviewForm({ onResult }: { onResult: (markdown: string) => void }) {
  const [apiUrl, setApiUrl] = useState('/api/review')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [requirements, setRequirements] = useState('')
  const [specs, setSpecs] = useState('')
  const [reviewGuidelines, setReviewGuidelines] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('files', f))
      fd.append('model', model)
      fd.append('requirements', requirements)
      fd.append('specs', specs)
      fd.append('reviewGuidelines', reviewGuidelines)

      const headers: Record<string, string> = {}
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

      const res = await fetch(apiUrl || '/api/review', { method: 'POST', body: fd, headers })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `Status ${res.status}`)
      }
      const contentType = res.headers.get('content-type') || ''
      let md = ''
      if (contentType.includes('application/json')) {
        const j = await res.json()
        md = j.markdown || j.result || JSON.stringify(j)
      } else {
        md = await res.text()
      }
      onResult(md)
    } catch (err: any) {
      setError(err?.message || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">API 地址</label>
        <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">模型名称</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">API Key</label>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">设计需求</label>
        <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={4} className="mt-1 block w-full rounded-md border px-3 py-2" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">设计规范</label>
        <textarea value={specs} onChange={(e) => setSpecs(e.target.value)} rows={4} className="mt-1 block w-full rounded-md border px-3 py-2" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">评审规范</label>
        <textarea value={reviewGuidelines} onChange={(e) => setReviewGuidelines(e.target.value)} rows={4} className="mt-1 block w-full rounded-md border px-3 py-2" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">文件上传</label>
        <div className="mt-2">
          <FileUpload files={files} onChange={setFiles} />
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md" disabled={loading}>
          {loading ? '提交中...' : '提交'}
        </button>
      </div>
    </form>
  )
}


