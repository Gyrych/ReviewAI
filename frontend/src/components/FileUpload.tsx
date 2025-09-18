import React, { useEffect, useRef, useState } from 'react'

type FileUploadProps = {
  files: File[]
  onChange: (files: File[]) => void
  maxFiles?: number
  maxSizeMB?: number
}

export default function FileUpload({ files, onChange, maxFiles = 10, maxSizeMB = 10 }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [previews, setPreviews] = useState<{ id: string; url?: string; name: string; type: string }[]>([])

  useEffect(() => {
    const p = files.map((f) => {
      const isImage = f.type.startsWith('image/')
      return {
        id: `${f.name}_${f.size}_${f.lastModified}`,
        url: isImage ? URL.createObjectURL(f) : undefined,
        name: f.name,
        type: f.type,
      }
    })
    // revoke old urls
    setPreviews((old) => {
      old.forEach((o) => o.url && URL.revokeObjectURL(o.url))
      return p
    })
    return () => {
      p.forEach((x) => x.url && URL.revokeObjectURL(x.url))
    }
  }, [files])

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    const arr = Array.from(selected)
    const allowed = arr.filter((f) => {
      const okType = ['image/jpeg', 'image/png', 'application/pdf'].includes(f.type)
      const okSize = f.size <= maxSizeMB * 1024 * 1024
      return okType && okSize
    })
    const combined = files.concat(allowed).slice(0, maxFiles)
    onChange(combined)
  }

  function removeAt(idx: number) {
    const next = files.slice(0, idx).concat(files.slice(idx + 1))
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,application/pdf"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <button
          type="button"
          className="px-3 py-2 bg-white dark:bg-gray-700 dark:text-gray-100 border dark:border-gray-600 rounded shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600"
          onClick={() => inputRef.current?.click()}
        >
          选择文件
        </button>
        <div className="text-sm text-gray-500 dark:text-gray-300">已选 {files.length} / {maxFiles}</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {previews.map((p, i) => (
          <div key={p.id} className="border rounded p-2 bg-white dark:bg-gray-800 dark:border-gray-700 flex flex-col items-center">
            {p.url ? (
              <img src={p.url} alt={p.name} className="w-full h-24 object-contain" />
            ) : (
              <div className="w-full h-24 flex items-center justify-center text-sm text-gray-600 dark:text-gray-300">{p.name}</div>
            )}
            <div className="mt-2 w-full flex justify-between items-center">
              <div className="text-xs text-gray-700 dark:text-gray-200 truncate">{p.name}</div>
              <button className="text-red-500 text-xs dark:text-red-400" onClick={() => removeAt(i)}>移除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


