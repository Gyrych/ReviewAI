/**
 * Citation 实体定义与构造函数
 *
 * 说明：此文件定义后端使用的 Citation 类型，并提供一个轻量的构造函数。
 * 文件注释为中文以满足仓库注释规范。
 */
export interface Citation {
  id: string;
  annotatedMessageId: string;
  url: string;
  domain?: string | null;
  title?: string | null;
  snippet?: string | null;
  startIndex?: number | null;
  endIndex?: number | null;
  confidenceScore?: number | null;
  rawHtml?: string | null;
  fetchTimestamp?: string | null;
  mimeType?: string | null;
  favicon?: string | null;
  createdAt: string;
}

/** 生成 UUID 的轻量实现，优先使用 crypto.randomUUID（Node 18+），否则回退到伪随机字符串 */
function generateUuid(): string {
  try {
    // @ts-ignore
    if (typeof globalThis?.crypto?.randomUUID === 'function') {
      // @ts-ignore
      return (globalThis as any).crypto.randomUUID();
    }
  } catch (e) {
    // 忽略错误并回退
  }
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * 创建一个完整的 Citation 对象，补充缺失字段与时间戳
 */
export function createCitation(partial: Partial<Citation>): Citation {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? generateUuid(),
    annotatedMessageId: partial.annotatedMessageId ?? '',
    url: partial.url ?? '',
    domain: partial.domain ?? null,
    title: partial.title ?? null,
    snippet: partial.snippet ?? null,
    startIndex: typeof partial.startIndex === 'number' ? partial.startIndex : null,
    endIndex: typeof partial.endIndex === 'number' ? partial.endIndex : null,
    confidenceScore: typeof partial.confidenceScore === 'number' ? partial.confidenceScore : null,
    rawHtml: partial.rawHtml ?? null,
    fetchTimestamp: partial.fetchTimestamp ?? null,
    mimeType: partial.mimeType ?? null,
    favicon: partial.favicon ?? null,
    createdAt: partial.createdAt ?? now,
  };
}

export default Citation;


