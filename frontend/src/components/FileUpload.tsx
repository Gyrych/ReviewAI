/*
功能：文件上传组件（FileUpload）
用途：统一处理多文件选择/预览/大小与数量限制，供评审表单复用。
参数：
- files: File[] 受控文件列表
- onChange(files): 回调返回新文件列表
- maxFiles?: number 最大文件数（默认 20）
- maxSizeMB?: number 单文件大小 MB（默认 10）
返回：
- React 组件
示例：
// <FileUpload files={files} onChange={setFiles} />
*/
import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'

type FileUploadProps = {
  files: File[]
  onChange: (files: File[]) => void
  maxFiles?: number
  maxSizeMB?: number
}

export default function FileUpload({ files, onChange, maxFiles = 20, maxSizeMB = 10 }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [previews, setPreviews] = useState<{ id: string; url?: string; name: string; type: string }[]>([])
  const { t } = useI18n()

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
          id="file-input"
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,application/pdf"
          onChange={(e) => handleFiles(e.target.files)}
          className="sr-only"
        />
        <label
          htmlFor="file-input"
          className="px-3 py-2 bg-white dark:bg-cursorPanel dark:text-cursorText border dark:border-cursorBorder rounded shadow-sm hover:bg-gray-50 dark:hover:bg-[#121215] cursor-pointer"
        >
          {t('upload.select')}
        </label>
        <div className="text-sm text-gray-500 dark:text-gray-300">{t('upload.selected', { count: files.length, max: maxFiles })}</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {previews.map((p, i) => (
          <div key={p.id} className="border rounded p-2 bg-white dark:bg-cursorPanel dark:border-cursorBorder flex flex-col items-center">
            {p.url ? (
              <img src={p.url} alt={p.name} className="w-full h-24 object-contain" />
            ) : (
              <div className="w-full h-24 flex items-center justify-center text-sm text-gray-600 dark:text-gray-300">{p.name}</div>
            )}
            <div className="mt-2 w-full flex justify-between items-center">
              <div className="text-xs text-gray-700 dark:text-cursorText truncate">{p.name}</div>
              <button className="text-red-500 text-xs dark:text-red-400" onClick={() => removeAt(i)}>{t('upload.remove')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


