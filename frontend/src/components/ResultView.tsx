import React from 'react'
import { useI18n } from '../i18n'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { materialDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

export default function ResultView({ markdown, enrichedJson, overlay, setEnrichedJson, timeline }: { markdown: string, enrichedJson?: any, overlay?: any, setEnrichedJson?: (j:any)=>void, timeline?: { step: string; ts?: number; meta?: any }[] }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({})
  function toggleExpand(i: number) { setExpanded((s) => ({ ...s, [i]: !s[i] })) }
  function renderTimeline() {
    if (!timeline || timeline.length === 0) return null
    const reversed = [...timeline].slice().reverse()
    return (
      <div className="mb-4 p-2 border rounded bg-gray-50 dark:bg-cursorBlack dark:border-cursorBorder">
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
    </div>
  )
}


