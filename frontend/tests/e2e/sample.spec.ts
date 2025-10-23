import { test, expect } from '@playwright/test'

test('homepage loads and shows brand', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('text=ReviewAI')).toBeVisible()
})


