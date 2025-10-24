# CI 示例：在 GitHub Actions 中运行 Playwright 并保存报告

示例工作流（占位）：

```yaml
name: CI Playwright E2E
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install frontend deps
        run: |
          cd frontend
          npm ci
      - name: Start frontend (background)
        run: |
          cd frontend
          npm run dev &
      - name: Run Playwright
        run: |
          npx playwright test --reporter=list,html --output=./test-reports
      - name: Upload Playwright HTML Report
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/test-reports/playwright-html
```

说明：此示例为最小可用配置，实际 CI 中应先构建并启动所需后端服务或使用已部署环境。


