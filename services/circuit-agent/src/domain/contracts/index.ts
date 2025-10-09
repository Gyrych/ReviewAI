// 中文注释：领域层抽象接口（高内聚、低耦合，不依赖基础设施）

export type PinRef = { componentId: string; pin: string; confidence?: number }
export type Net = { netId: string; connectedPins: PinRef[]; confidence?: number }
export type Component = { id: string; type: string; label?: string; pins?: PinRef[]; params?: Record<string, any> }
export type DatasheetMeta = { componentName: string; sourceUrl: string; sourceType: 'manufacturer'|'distributor'|'third-party'; confidence: number; notes?: string }
export type CircuitGraph = { components: Component[]; nets: Net[]; overlay?: any; metadata?: any; datasheetMeta?: DatasheetMeta[] }

export type Attachment = { name: string; mime: string; bytes: Buffer }
export type Conversation = { role: 'user'|'assistant'; content: string }

export type ReviewRequest = {
  files?: Attachment[]
  systemPrompt: string
  requirements?: string
  specs?: string
  bom?: Attachment[]
  designDocs?: Attachment[]
  dialog?: string
  history?: Conversation[]
  options?: { enableSearch?: boolean; searchTopN?: number; progressId?: string; models?: string[] }
}

export type TimelineItem = { step: string; ts: number; origin: 'agent'|'external'|'frontend'|'backend'; category?: string; meta?: any; artifacts?: Record<string, any> }
export type ReviewReport = { markdown: string; timeline: TimelineItem[]; enriched?: CircuitGraph }

export interface VisionProvider {
  recognizeSingle(image: Attachment, prompt: string, model: string): Promise<CircuitGraph>
  recognizeMultiPass(images: Attachment[], model: string, passes: 5): Promise<CircuitGraph[]>
  consolidate(results: CircuitGraph[], model: string): Promise<CircuitGraph>
}

export interface LlmProvider {
  chat(params: { apiUrl: string; model: string; system: string; messages: Conversation[]; timeoutMs?: number; headers?: Record<string,string> }): Promise<{ text: string; raw: string }>
}

// 中文注释：富消息（支持图像 data URL）以便直接评审模式调用多模态模型
export type RichPart = { type: 'text'|'image_url'; text?: string; image_url?: { url: string } }
export type RichMessage = { role: 'system'|'user'|'assistant'; content: string | RichPart[] }

export interface VisionChatProvider {
  chatRich(params: { apiUrl: string; model: string; messages: RichMessage[]; timeoutMs?: number; headers?: Record<string,string> }): Promise<{ text: string; raw: string }>
}

export interface SearchProvider {
  search(query: string, topN: number): Promise<{ title: string; url: string }[]>
}

export interface ArtifactStore {
  save(content: string|Buffer, hint: string, meta?: { contentType?: string; ext?: string }): Promise<{ url: string; filename: string }>
}

export interface SessionStore {
  save(payload: any): Promise<{ id: string }>
  load(id: string): Promise<any>
  list(limit: number): Promise<any[]>
  remove(id: string): Promise<void>
}

export interface ProgressStore {
  init(id: string): Promise<void>
  push(id: string, item: TimelineItem): Promise<void>
  get(id: string): Promise<TimelineItem[]>
  clear(id: string): Promise<void>
}

export interface Anonymizer {
  scrubInput<T = any>(input: T): T
}

export const POLICIES = {
  VISION_PASSES: 5 as const,
  SEARCH_PROVIDER: 'openrouter_online' as const
}


