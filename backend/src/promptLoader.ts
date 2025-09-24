import fs from 'fs'
import path from 'path'

// 中文注释：简易提示词加载器
// 功能：在运行时从 schematic-ai-review-prompt 目录读取指定语言的 prompt 文件，并做简单缓存与占位符替换

type Lang = 'zh' | 'en'

const PROMPT_DIR = path.resolve(__dirname, '..', '..', 'schematic-ai-review-prompt')
const CACHE: { [key: string]: { text: string; ts: number } } = {}

function resolveFilename(lang: Lang, name: string) {
  const fname = lang === 'en' ? `${name}.md` : `${name}.md`
  // 支持中文文件名（如果 name 为 SystemPrompt，则中文文件为 系统提示词.md）
  if (lang === 'zh') {
    if (name === 'SystemPrompt') return '系统提示词.md'
    if (name === 'ParserSystem') return '解析器系统提示.md'
    if (name === 'Consolidation') return '整合提示.md'
  }
  return fname
}

export async function loadPrompt(lang: Lang, name: string, opts?: { disableCache?: boolean }): Promise<string> {
  const filename = resolveFilename(lang, name)
  const fullPath = path.join(PROMPT_DIR, filename)

  const cacheKey = `${lang}:${name}:${fullPath}`
  if (!opts?.disableCache && CACHE[cacheKey]) {
    return CACHE[cacheKey].text
  }

  // 回退路径：仓库根目录下也可能存在 prompt 文件
  const fallbackPath = path.resolve(process.cwd(), filename)

  let p = fullPath
  if (!fs.existsSync(p)) {
    if (fs.existsSync(fallbackPath)) p = fallbackPath
    else throw new Error(`prompt file not found: ${filename}`)
  }

  const txt = fs.readFileSync(p, { encoding: 'utf8' })
  CACHE[cacheKey] = { text: txt, ts: Date.now() }
  return txt
}

export function renderTemplate(template: string, vars?: Record<string, any>): string {
  if (!vars) return template
  return template.replace(/{{\s*([a-zA-Z0-9_\.]+)\s*}}/g, (m, key) => {
    const parts = key.split('.')
    let v: any = vars
    for (const p of parts) {
      if (v && Object.prototype.hasOwnProperty.call(v, p)) v = v[p]
      else return ''
    }
    return typeof v === 'string' ? v : JSON.stringify(v)
  })
}

// 导出帮助函数：用于检测语言优先级
export function normalizeLang(lang?: string): Lang {
  if (!lang) return 'zh'
  const l = String(lang).toLowerCase()
  if (l === 'en' || l === 'english') return 'en'
  return 'zh'
}

export default { loadPrompt, renderTemplate, normalizeLang }


