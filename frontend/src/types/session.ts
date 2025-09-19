// 中文注释：前端会话相关类型定义

export type SessionHistory = { role: 'user' | 'assistant'; content: string }

export type SessionFileV1 = {
  id?: string
  version: 1
  createdAt?: string
  source?: 'circuit' | 'code' | 'doc' | 'req'
  apiUrl: string
  model: string
  customModelName?: string
  requirements: string
  specs: string
  questionConfirm: string
  dialog: string
  history: SessionHistory[]
  markdown: string
  enrichedJson?: any
  overlay?: any
  files?: { name: string; type: string; size: number; lastModified?: number; dataBase64: string }[]
}

export type SessionListItem = {
  id: string
  filename: string
  createdAt: string
  apiHost?: string
  model?: string
  hasFiles?: boolean
}

export type SessionSeed = {
  requirements: string
  specs: string
  questionConfirm: string
  dialog: string
  history: SessionHistory[]
  files: { name: string; type: string; size: number; lastModified?: number; dataBase64: string }[]
  enrichedJson?: any
}


