import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import ResultView from '../../src/components/ResultView'

describe('frontend search summary integration', () => {
  it('renders citations list with clickable anchors and hostnames', () => {
    const citations = [
      { url: 'https://example.com/a', title: 'Example A' },
      { url: 'https://sub.domain.com/path', title: undefined },
    ]
    const html = ReactDOMServer.renderToString(
      React.createElement(ResultView, {
        markdown: '# Title',
        citations,
      })
    )
    // 断言渲染包含超链接与标题/URL 文本
    expect(html).toContain('href="https://example.com/a"')
    expect(html).toContain('Example A')
    expect(html).toContain('href="https://sub.domain.com/path"')
    // 断言域名展示
    expect(html).toContain('example.com')
    expect(html).toContain('sub.domain.com')
  })
})


