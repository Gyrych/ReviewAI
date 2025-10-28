/**
 * AnnotatedMessage 实体定义
 *
 * 说明：表示模型返回的消息主体，包含原始响应 artifact 路径与引用引用数组。
 */
export interface AnnotatedMessage {
  id: string;
  createdAt: string;
  requestId: string;
  modelResponseRaw?: any;
  textContent?: string | null;
  citations?: string[]; // 存放 Citation id 列表
  parsedMetadata?: any;
  artifactPath?: string | null;
  status?: 'processed' | 'needs_review' | 'failed';
  reviewerId?: string | null;
  reviewNotes?: string | null;
}

export function createAnnotatedMessage(partial: Partial<AnnotatedMessage>): AnnotatedMessage {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    createdAt: partial.createdAt ?? now,
    requestId: partial.requestId ?? '',
    modelResponseRaw: partial.modelResponseRaw ?? null,
    textContent: partial.textContent ?? null,
    citations: partial.citations ?? [],
    parsedMetadata: partial.parsedMetadata ?? null,
    artifactPath: partial.artifactPath ?? null,
    status: partial.status ?? 'processed',
    reviewerId: partial.reviewerId ?? null,
    reviewNotes: partial.reviewNotes ?? null,
  } as AnnotatedMessage;
}

export default AnnotatedMessage;


