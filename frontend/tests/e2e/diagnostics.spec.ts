import { test, expect } from '@playwright/test'

test.describe('错误兜底与导出诊断', () => {
  test('后端异常时渲染 ErrorDiagnostic 并可导出诊断', async ({ page }) => {
    // 打开首页
    await page.goto('/')

    // 选择 agent（若默认即为电路 agent 可略过）
    // 确保页面渲染提交按钮
    const submitBtn = page.getByRole('button', { name: /提交|submit/i })
    await expect(submitBtn).toBeVisible()

    // 通过拦截后端 /orchestrate/review，模拟 500 错误以触发错误兜底
    await page.route('**/orchestrate/review', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'PromptLoadError', message: 'Missing prompt', details: { missing: ['a.md'] } } }) })
    })

    // 直接点击提交（允许表单空提交，组件应有兜底防御）
    await submitBtn.click()

    // 期望显示导出诊断按钮
    const exportBtn = page.getByRole('button', { name: /导出诊断|export diagnostics/i })
    await expect(exportBtn).toBeVisible({ timeout: 10_000 })
  })
})


