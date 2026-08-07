import { expect, test } from '@playwright/test';

test('worker responds', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('body')).toContainText(/Pikiwedia/i);
});
