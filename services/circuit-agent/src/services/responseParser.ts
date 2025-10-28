/**
 * responseParser
 *
 * 负责将 LLM/搜索提供者返回的文本或 JSON 响应解析为 AnnotatedMessage 与 Citation 结构。
 * 注：此实现为轻量解析器，优先处理常见 JSON 包含 citations 字段的结构；否则尝试正则提取 URL 并生成简单 Citation。
 */
import { createCitation, Citation } from '../models/citation';

export interface ParsedCitation extends Citation {}

export interface ParsedAnnotatedMessage {
  id: string;
  text: string;
  citations: ParsedCitation[];
  raw?: any;
}

/** 检测对象中是否包含可能的 citations 字段 */
function hasCitationsField(obj: any): boolean {
  return obj && (Array.isArray(obj.citations) || Array.isArray(obj.Citations) || Array.isArray(obj.citation));
}

/** 使用正则从文本中抽取 URL 列表（简化实现） */
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s)\]]+/g;
  const matches = text.match(urlRegex);
  return matches ?? [];
}

/** 主解析函数 */
export function parseResponse(response: any, opts?: { summaryLength?: any }): ParsedAnnotatedMessage {
  // 如果是字符串，尝试从文本抽取 URL
  if (typeof response === 'string') {
    const urls = extractUrls(response);
    const citations = urls.map((u) => createCitation({ url: u, annotatedMessageId: '' }));
    return { id: 'id-' + Date.now().toString(36), text: response, citations, raw: response };
  }

  // 如果对象中包含 citations 字段，映射为 Citation
  if (hasCitationsField(response)) {
    const rawCitations = response.citations || response.Citations || response.citation;
    const citations = Array.isArray(rawCitations)
      ? rawCitations.map((c: any) => createCitation({
          annotatedMessageId: '',
          url: c.url ?? c.link ?? '',
          title: c.title ?? null,
          snippet: c.snippet ?? c.excerpt ?? null,
          confidenceScore: typeof c.confidence === 'number' ? c.confidence : null,
        }))
      : [];
    const text = response.text ?? response.content ?? JSON.stringify(response);
    return { id: 'id-' + Date.now().toString(36), text, citations, raw: response };
  }

  // 退回：将对象序列化并提取 URL
  const serialized = JSON.stringify(response);
  const urls = extractUrls(serialized);
  const citations = urls.map((u) => createCitation({ url: u, annotatedMessageId: '' }));
  const parsed = { id: 'id-' + Date.now().toString(36), text: serialized, citations, raw: response };
  if (opts && opts.summaryLength) {
    // 回写 summaryLength 供后续使用或前端展示
    (parsed as any).summaryLength = opts.summaryLength
  }
  return parsed;
}

export default parseResponse;


