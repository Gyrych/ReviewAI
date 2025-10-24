const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'frontend', 'src');

function walk(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  files.forEach(f => {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) return walk(p);
    if (!p.endsWith('.ts') && !p.endsWith('.tsx') && !p.endsWith('.js') && !p.endsWith('.jsx')) return;
    const content = fs.readFileSync(p, 'utf8');
    if (content.includes("from '../services/") || content.includes("from 'services/")) {
      console.log('VIOLATION:', p);
      process.exitCode = 2;
    }
  });
}

if (!fs.existsSync(srcDir)) {
  console.error('frontend/src not found');
  process.exit(1);
}

walk(srcDir);
if (!process.exitCode) console.log('No cross-imports detected');


