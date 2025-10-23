const fs = require('fs')
const path = require('path')

const SPEC = path.join('specs', '003-validate-code-against-constitution', 'spec.md')
const txt = fs.readFileSync(SPEC, 'utf8')
// 简单检测 Given/When/Then 字样出现次数
const matches = (txt.match(/Given|When|Then/gi) || []).length
const out = { gwtOccurrences: matches, timestamp: new Date().toISOString() }
fs.writeFileSync(path.join('specs', '003-validate-code-against-constitution', 'gwt-report.json'), JSON.stringify(out, null, 2))
console.log('gwt-report.json generated', out)


