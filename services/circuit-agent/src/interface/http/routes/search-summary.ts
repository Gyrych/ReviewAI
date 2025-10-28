/**
 * /search-summary 路由
 *
 * 说明：实现单次搜索+摘要的后端编排入口的轻量实现。
 * 本文件接收上游模型/检索提供者的原始响应（或用于测试的模拟响应），
 * 使用 responseParser 解析为 AnnotatedMessage 与 Citation，然后
 * 将原始响应及解析结果保存为 artifact 以便审计与前端展示。
 *
 * 注：为了最小侵入，本实现使用注入的 artifact 存储来保存数据，
 * 不直接操作数据库；后续可将 artifact 的内容写入持久 DB。
 */
import type { Request, Response } from 'express'
import { parseResponse } from '../../../services/responseParser.js'
import type { ArtifactStore } from '../../../domain/contracts/index.js'
import storageService from '../../../services/storageService.js'

export function makeSearchSummaryRouter(deps: { artifact: ArtifactStore, storageRoot?: string }) {
  const handler = async (req: Request, res: Response) => {
    try {
      const body = req.body || {}
      // 允许前端直接传入 provider 的原始响应用于解析和保存（便于 TDD 与集成测试）
      const providerResponse = body.response
      if (!providerResponse) return res.status(400).json({ error: 'Missing response in request body' })

      // 1) 保存原始响应为 artifact
      let rawSaved: any = null
      try {
        const rawStr = typeof providerResponse === 'string' ? providerResponse : JSON.stringify(providerResponse)
        rawSaved = await deps.artifact.save(rawStr, 'search_raw_response', { ext: '.json', contentType: 'application/json' })
      } catch (e) {
        // 保存失败不阻断解析流程，但记录警告
        console.warn('artifact.save raw failed', (e as any)?.message || String(e))
      }

      // 2) 解析为 AnnotatedMessage + Citation
      // 支持可选的 summary_length 参数（short|medium|long 或 token 数），并回写到解析结果以便后续处理
      const summaryLength = (body && (body.summary_length || body.summaryLength)) || null
      const parsed = parseResponse(providerResponse, { summaryLength })

      // 3) 将解析结果保存为 artifact 以便审计
      let parsedSaved: any = null
      try {
        parsedSaved = await deps.artifact.save(JSON.stringify(parsed), 'annotated_message', { ext: '.json', contentType: 'application/json' })
      } catch (e) {
        console.warn('artifact.save parsed failed', (e as any)?.message || String(e))
      }

      // 4) 持久化到存储服务（本地文件系统 / 生产替换为 DB）
      let storageResult: any = null
      try {
        storageResult = await storageService.saveAnnotatedMessage(parsed)
      } catch (e) {
        console.warn('storageService.saveAnnotatedMessage failed', (e as any)?.message || String(e))
      }

      // 5) 将每个 citation 单独保存为 artifact 与存储服务，并收集元数据
      const citationsMeta = [] as any[]
      try {
        for (const c of parsed.citations || []) {
          try {
            // 将 annotatedMessageId 回写为 parsed.id
            c.annotatedMessageId = parsed.id
            const s = JSON.stringify(c)
            const saved = await deps.artifact.save(s, 'citation', { ext: '.json', contentType: 'application/json' })
            const stored = await storageService.saveCitation(c)
            citationsMeta.push({ url: c.url, artifact: saved, stored })
          } catch (e) {
            citationsMeta.push({ url: c.url, artifact: null, stored: null })
          }
        }
      } catch {}

      // 返回解析摘要、artifact 与存储元数据
      return res.json({ id: parsed.id, text: parsed.text, citations: citationsMeta, requestedSummaryLength: summaryLength, rawArtifact: rawSaved, parsedArtifact: parsedSaved, storage: storageResult })
    } catch (e: any) {
      try { console.error('search-summary.failed', (e as any)?.message || String(e)) } catch {}
      return res.status(502).json({ error: 'upstream_error', message: e?.message || String(e) })
    }
  }

  return { handler }
}

export default makeSearchSummaryRouter


