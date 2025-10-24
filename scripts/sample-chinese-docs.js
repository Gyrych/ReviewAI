const fs = require('fs')
const path = require('path')

// 中文注释：对 services/circuit-agent/src 下的文件做简单注释抽样，统计包含中文注释的文件比例
function walkDir(dir, files = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true })
  for (const it of items) {
    const p = path.join(dir, it.name)
    if (it.isDirectory()) walkDir(p, files)
    else if (p.endsWith('.ts') || p.endsWith('.js')) files.push(p)
  }
  return files
}

function hasChineseComment(content) {
  const re = /[\u4e00-\u9fff]/
  const lineComments = content.match(/\/\/.*$/gm) || []
  const blockComments = content.match(/\/\*[\s\S]*?\*\//gm) || []
  const comments = lineComments.concat(blockComments)
  return comments.some(c => re.test(c))
}

const srcDir = path.resolve(process.cwd(), 'services', 'circuit-agent', 'src')
if (!fs.existsSync(srcDir)) {
  console.error('services/circuit-agent/src not found')
  process.exit(1)
}

const files = walkDir(srcDir)
const report = { totalFiles: files.length, filesWithChineseComments: [], timestamp: new Date().toISOString() }
for (const f of files) {
  try {
    const txt = fs.readFileSync(f, 'utf8')
    if (hasChineseComment(txt)) report.filesWithChineseComments.push(f)
  } catch (e) {}
}

report.coverage = Number(((report.filesWithChineseComments.length / Math.max(1, report.totalFiles)) * 100).toFixed(2))
const outDir = path.join('specs', '003-validate-code-against-constitution')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'chinese-docs-report.json'), JSON.stringify(report, null, 2), 'utf8')
console.log('chinese-docs-report.json written:', report.coverage + '%')


