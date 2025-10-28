/*
功能：结果视图（ResultView）
用途：渲染 Markdown 评审结果、可选的结构化 JSON/覆盖图/时间线，并支持代码高亮与折叠。
参数：
- markdown: string 主体文档
- enrichedJson?: any 结构化增强数据
- overlay?: any 叠加数据
- setEnrichedJson?: (j:any)=>void 状态回传
- timeline?: { step:string; ts?:number; meta?:any }[]
- searchSummaries?: string[] 联网搜索摘要
返回：
- React 组件
示例：
// <ResultView markdown={md} timeline={tl} />
*/
import React from 'react'
import { useI18n } from '../i18n'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { materialDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

export default function ResultView({ markdown, enrichedJson, overlay, setEnrichedJson, timeline, searchSummaries, citations }: { markdown: string, enrichedJson?: any, overlay?: any, setEnrichedJson?: (j:any)=>void, timeline?: { step: string; ts?: number; meta?: any }[], searchSummaries?: string[], citations?: { url: string; title?: string }[] }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({})
  function toggleExpand(i: number) { setExpanded((s) => ({ ...s, [i]: !s[i] })) }
  function renderTimeline() {
    if (!timeline || timeline.length === 0) return null
    const reversed = [...timeline].slice().reverse()
    // 将步骤历史与上方评审区域视觉分离：使用卡片化白色背景（暗色模式下为 panel），并增加内边距与阴影
    return (
      <div className="mb-4 p-4 border rounded bg-white dark:bg-cursorPanel dark:border-cursorBorder shadow-sm">
        <div className="text-sm font-medium mb-2">{t('timeline.label')}</div>
        <ul className="text-xs space-y-1">
          {reversed.map((it, idx) => (
            <li key={idx} className="">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(idx)}>
                <div className="truncate mr-4">{t(`step_${it.step}`) || it.step}</div>
                <div className="text-gray-500 dark:text-gray-400 text-right">
                  <div>{it.ts ? new Date(it.ts).toLocaleString() : ''}</div>
                </div>
              </div>
              {expanded[idx] && (
                <div className="mt-1 p-2 bg-white dark:bg-cursorPanel rounded border dark:border-cursorBorder text-xs">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(it, null, 2)}</pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  function renderOverlay() {
    if (!overlay) return null
    // overlay.svg can be raw SVG string or base64; for simplicity assume raw SVG
    const svg = overlay.svg || ''
    const mapping = overlay.mapping || {}
    return (
      <div className="border p-2 mb-2">
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="text-sm text-gray-600 mt-2">{t('overlay.mapping.entries', { count: Object.keys(mapping).length })}</div>
      </div>
    )
  }

  function renderSearchSummaries() {
    if (!Array.isArray(searchSummaries) || searchSummaries.length === 0) return null
    return (
      <details className="mt-4 p-2 border rounded bg-gray-50 dark:bg-cursorBlack dark:border-cursorBorder">
        <summary className="cursor-pointer">检索摘要（Search Summaries）</summary>
        <div className="mt-2 text-xs space-y-2">
          {searchSummaries.map((s, i) => (
            <div key={i} className="p-2 bg-white dark:bg-cursorPanel rounded border dark:border-cursorBorder">
              <pre className="whitespace-pre-wrap">{s}</pre>
            </div>
          ))}
        </div>
      </details>
    )
  }

  function renderCitations() {
    if (!Array.isArray(citations) || citations.length === 0) return null
    return (
      <div className="mt-4 p-2 border rounded bg-white dark:bg-cursorPanel dark:border-cursorBorder">
        <div className="text-sm font-medium mb-2">引用 (Citations)</div>
        <ul className="text-xs space-y-1">
          {citations.map((c, i) => (
            <li key={i} className="flex items-center justify-between">
              <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 truncate">{c.title || c.url}</a>
              <div className="text-gray-500 text-xs ml-2">{(() => { try { return new URL(c.url).hostname } catch { return c.url } })()}</div>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="prose dark:prose-invert max-w-none bg-white dark:bg-cursorPanel p-4 rounded border dark:border-cursorBorder dark:text-cursorText glass">
      {renderOverlay()}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            return !inline && match ? (
              <SyntaxHighlighter style={materialDark} language={match[1]} PreTag="div" {...props}>
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
      {enrichedJson && (
        <details className="mt-4 p-2 border rounded bg-gray-50 dark:bg-cursorBlack dark:border-cursorBorder">
          <summary className="cursor-pointer">{t('overlay.enrichedJson.title')}</summary>
          <pre className="mt-2 text-xs">{JSON.stringify(enrichedJson, null, 2)}</pre>
        </details>
      )}
      {renderSearchSummaries()}
      {renderCitations()}
    </div>
  )
}


