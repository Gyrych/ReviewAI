const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'services', 'circuit-agent', 'src');
const out = [];

function walk(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  files.forEach(f => {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) return walk(p);
    if (!p.endsWith('.ts') && !p.endsWith('.js')) return;
    const content = fs.readFileSync(p, 'utf8');
    const comments = (content.match(/\/\*\*[\s\S]*?\*\//g) || []).join('\n');
    const hasChinese = /[\u4e00-\u9fa5]/.test(comments);
    out.push({ file: p, hasChinese });
  });
}

if (!fs.existsSync(srcDir)) {
  console.error('services/circuit-agent/src not found');
  process.exit(1);
}

walk(srcDir);
const reportPath = path.join(__dirname, '..', 'specs', '003-validate-code-against-constitution', 'chinese-comments-report.json');
fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
console.log('Report written to', reportPath);


