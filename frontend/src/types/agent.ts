/*
功能：Agent 类型定义
用途：用于前端不同 Agent 组件之间的一致集成约定。
参数：无
返回：导出 AgentDescriptor 与 AgentSessionFile 类型
示例：
// import type { AgentDescriptor } from './types/agent'
*/
// frontend/src/types/agent.ts
// Agent 类型定义：用于前端不同 Agent 组件之间的一致集成约定

export type AgentDescriptor = {
	id: string // agent 唯一标识，例如 'circuit' 或 'circuit-fine'
	label: string // 在 UI 标签上显示的文本
	baseUrl: string // agent 后端 base URL，例如 '/api/v1/circuit-agent'
	// component 在注册时按需懒加载；声明为 any 以避免在此文件引入 React
	component?: any
}

export type AgentSessionFile = {
	version: number
	agentId: string
	apiUrl: string
	model: string
	customModelName?: string
	markdown?: string
	enrichedJson?: any
	overlay?: any
	timeline?: any[]
	files?: { name: string; type: string; size: number; lastModified?: number; dataBase64?: string }[]
}

export type AgentComponentProps = {
	agentDescriptor: AgentDescriptor
	apiKey: string
	model: string
	customModelName?: string
	allowedApiUrls: string[]
	onSavePair?: (api: string, model: string) => void
	sessionSeed?: AgentSessionFile | undefined
	onGlobalResult?: (agentId: string, markdown: string) => void
}
