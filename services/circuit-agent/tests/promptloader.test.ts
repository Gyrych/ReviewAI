import { describe, it, expect, beforeEach } from 'vitest'
import { PromptLoader, PromptLoadError } from '../src/infra/prompts/PromptLoader.js'
import * as fs from 'fs'
import * as path from 'path'

// 中文注释：该测试不修改源码，仅通过临时移动/创建空文件来模拟缺失/空白场景

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const agentDir = path.resolve(repoRoot, 'ReviewAIPrompt', 'circuit-agent')

function ensureDir(p: string) { try { fs.mkdirSync(p, { recursive: true }) } catch {} }
function writeFile(p: string, c: string) { ensureDir(path.dirname(p)); fs.writeFileSync(p, c, 'utf8') }
function exists(p: string) { try { return fs.existsSync(p) } catch { return false } }

describe('PromptLoader strict behaviors', () => {
  const initialZh = path.resolve(repoRoot, 'ReviewAIPrompt', 'circuit-agent', 'system_prompt_initial_zh.md')
  const backup = initialZh + '.bak_for_test'

  beforeEach(() => {
    // 确保目录存在
    ensureDir(path.dirname(initialZh))
    // 若不存在则写入一个占位内容，便于还原
    if (!exists(initialZh)) writeFile(initialZh, '# system prompt initial zh')
    // 清理缓存
    PromptLoader.clearCache()
  })

  it('should throw PromptLoadError when file is missing', () => {
    // 临时重命名以模拟缺失
    if (exists(initialZh)) fs.renameSync(initialZh, backup)
    try {
      expect(() => {
        PromptLoader.loadPrompt('circuit-agent', 'system', 'zh', 'initial')
      }).toThrowError(PromptLoadError)
    } finally {
      // 还原
      if (exists(backup)) fs.renameSync(backup, initialZh)
    }
  })

  it('should throw PromptLoadError when file is empty', () => {
    const emptyFile = initialZh
    // 备份原文件
    if (exists(initialZh)) fs.copyFileSync(initialZh, backup)
    try {
      writeFile(emptyFile, '')
      expect(() => {
        PromptLoader.loadPrompt('circuit-agent', 'system', 'zh', 'initial')
      }).toThrowError(PromptLoadError)
    } finally {
      // 还原内容
      if (exists(backup)) fs.copyFileSync(backup, initialZh)
      try { if (exists(backup)) fs.unlinkSync(backup) } catch {}
    }
  })
})


