import { test } from '@playwright/test';

const PAGES = [
  { slug: 'Ham_sandwich', name: 'ham-sandwich' },
  { slug: 'Main_Page', name: 'main-page' },
  { slug: 'Cheese', name: 'cheese' },
];

for (const { slug, name } of PAGES) {
  test(`screenshot ${name}`, async ({ page }, testInfo) => {
    await page.goto(`/wiki/${slug}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: false,
    });
  });
}
