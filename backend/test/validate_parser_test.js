const fs = require('fs')
const path = require('path')

// 简单验证脚本：检查示例 truth JSON 是否符合 schema（轻量断言）
function checkRequiredFields(obj) {
  if (!obj.components || !Array.isArray(obj.components)) throw new Error('components missing')
  if (!obj.nets || !Array.isArray(obj.nets)) throw new Error('nets missing')
  if (!obj.metadata) throw new Error('metadata missing')
}

function run() {
  const examplesDir = path.join(__dirname, '..', 'uploads', 'examples')
  const files = fs.readdirSync(examplesDir)
  const truthFiles = files.filter(f => f.endsWith('.truth.json'))
  if (truthFiles.length === 0) {
    console.log('No truth files found in', examplesDir)
    process.exit(0)
  }
  truthFiles.forEach(f => {
    const p = path.join(examplesDir, f)
    const content = fs.readFileSync(p, 'utf8')
    const obj = JSON.parse(content)
    try {
      checkRequiredFields(obj)
      console.log('PASS', f)
    } catch (e) {
      console.error('FAIL', f, e.message)
    }
  })
}

if (require.main === module) run()


