import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

type PromptFileResult = {
  path: string
  exists: boolean
  sizeBytes: number
  sha256?: string
}

// 中文注释：验证指定目录下的提示词文件。
// inputs: baseDir - 仓库根或 ReviewAIPrompt 目录的绝对/相对路径
//        files - 文件名数组，例如 ['system_prompt_initial_zh.md']
// 返回：PromptFileResult 数组
export function validatePromptFiles(baseDir: string, files: string[]): PromptFileResult[] {
  const results: PromptFileResult[] = []
  const resolvedBase = path.resolve(baseDir)
  for (const f of files) {
    const p = path.join(resolvedBase, f)
    try {
      const exists = fs.existsSync(p)
      if (!exists) {
        results.push({ path: p, exists: false, sizeBytes: 0 })
        continue
      }
      const stat = fs.statSync(p)
      const size = stat.size
      let sha
      if (size > 0) {
        const buf = fs.readFileSync(p)
        const h = crypto.createHash('sha256')
        h.update(buf)
        sha = h.digest('hex')
      }
      results.push({ path: p, exists: true, sizeBytes: size, sha256: sha })
    } catch (e: any) {
      results.push({ path: p, exists: false, sizeBytes: 0 })
    }
  }
  return results
}

// 中文注释：辅助函数 — 根据约定生成需要验证的提示词文件名列表
export function defaultPromptFileList(agent: string): string[] {
  // 约定：支持 initial/revision 与中/英文变体名
  return [
    `system_prompt_initial_zh.md`,
    `system_prompt_initial_en.md`,
    `system_prompt_revision_zh.md`,
    `system_prompt_revision_en.md`,
    `identify_prompt_zh.md`,
    `search_prompt_zh.md`,
  ].map((n) => path.join(agent, n))
}

export type PromptValidationSummary = {
  results: PromptFileResult[]
  missingCount: number
}

export function validateAndWriteSummary(repoRoot: string, agent: string, outPath: string): PromptValidationSummary {
  const files = defaultPromptFileList(agent)
  const fullBase = path.resolve(repoRoot, 'ReviewAIPrompt')
  const results = validatePromptFiles(fullBase, files)
  const missing = results.filter((r) => !r.exists || r.sizeBytes === 0).length
  const summary = { results, missingCount: missing }
  try {
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8')
  } catch (e) {
    // 忽略写入错误，上层负责处理
  }
  return summary
}

export default { validatePromptFiles, defaultPromptFileList, validateAndWriteSummary }


