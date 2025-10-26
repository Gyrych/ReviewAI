#!/usr/bin/env node
/*
  功能：校验 Playwright E2E 通过率阈值（默认 95%）
  用途：读取 frontend/test-reports/playwright-results.json，计算通过率，低于阈值则非零退出
  使用：node scripts/check-e2e-threshold.js [threshold]
*/
const fs = require('fs');
const path = require('path');

const threshold = Number(process.argv[2] || '0.95');
const reportPath = path.resolve(process.cwd(), 'frontend', 'test-reports', 'playwright-results.json');

if (!fs.existsSync(reportPath)) {
  console.error(`[check-e2e-threshold] 报告不存在：${reportPath}，请先运行前端 E2E 测试。`);
  process.exit(2);
}

try {
  const raw = fs.readFileSync(reportPath, 'utf8');
  const data = JSON.parse(raw);
  let passed = 0, failed = 0;
  // 优先从 stats 读取
  if (data && data.stats && typeof data.stats.expected === 'number') {
    passed = Number(data.stats.expected || 0);
    failed = Number(data.stats.unexpected || 0);
  } else if (Array.isArray(data.suites)) {
    // 退化遍历 suites/specs
    const stack = [...data.suites];
    while (stack.length) {
      const s = stack.pop();
      if (s.specs) {
        for (const sp of s.specs) {
          if (sp.ok) passed += 1; else failed += 1;
        }
      }
      if (s.suites) stack.push(...s.suites);
    }
  }
  const total = passed + failed;
  const rate = total > 0 ? passed / total : 1;
  console.log(`[check-e2e-threshold] 通过 ${passed}/${total} (${(rate*100).toFixed(2)}%)，阈值 ${(threshold*100).toFixed(0)}%`);
  if (rate < threshold) {
    console.error(`[check-e2e-threshold] 未达标，退出。`);
    process.exit(10);
  }
  process.exit(0);
} catch (e) {
  console.error('[check-e2e-threshold] 解析失败：', e && e.message ? e.message : e);
  process.exit(3);
}
