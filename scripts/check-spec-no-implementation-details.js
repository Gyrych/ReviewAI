const fs = require('fs')
const path = require('path')

const SPEC = path.join('specs', '003-validate-code-against-constitution', 'spec.md')
const keywords = ['Node', 'React', 'Vite', 'Express', 'API']
const txt = fs.readFileSync(SPEC, 'utf8')
const found = keywords.filter(k => txt.includes(k))
const out = { found, timestamp: new Date().toISOString() }
fs.writeFileSync(path.join('specs', '003-validate-code-against-constitution', 'implementation-details-report.json'), JSON.stringify(out, null, 2))
console.log('implementation-details-report.json generated', out)


