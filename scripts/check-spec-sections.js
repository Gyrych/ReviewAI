const fs = require('fs')
const path = require('path')

const SPEC = path.join('specs', '003-validate-code-against-constitution', 'spec.md')
const required = ['Purpose', 'Scope', 'Acceptance', 'Dependencies', 'Risks', 'Milestones']
const txt = fs.readFileSync(SPEC, 'utf8')
const missing = required.filter(k => !new RegExp(k, 'i').test(txt))
const out = { missing, timestamp: new Date().toISOString() }
fs.writeFileSync(path.join('specs', '003-validate-code-against-constitution', 'sections-report.json'), JSON.stringify(out, null, 2))
console.log('sections-report.json generated', out)


