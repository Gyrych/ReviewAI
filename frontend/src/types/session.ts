/*
功能：前端会话类型定义
用途：描述前端保存/导入导出的会话文件与时间线结构。
参数：无
返回：导出 SessionFileV1、SessionTimelineItem 等类型
示例：
// import type { SessionFileV1 } from './types/session'
*/
// 中文注释：前端会话相关类型定义

// 中文注释：会话消息历史条目
export type SessionHistory = { role: 'user' | 'assistant'; content: string; attachmentsMeta?: { name: string; type: string; size: number; }[]; ts?: number }

// 中文注释：步骤时间线条目，用于记录与大模型交互的处理阶段
export type SessionTimelineItem = { step: string; ts?: number; meta?: any }

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
  // questionConfirm 已移除：使用 history 保存所有用户/assistant 条目
  dialog: string
  history: SessionHistory[]
  // 可选：记录处理步骤时间线（前端/后端均可写入）
  timeline?: SessionTimelineItem[]
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
  // questionConfirm 已移除：使用 history 保存所有用户/assistant 条目
  dialog: string
  history: SessionHistory[]
  timeline?: SessionTimelineItem[]
  files: { name: string; type: string; size: number; lastModified?: number; dataBase64: string }[]
  enrichedJson?: any
}


