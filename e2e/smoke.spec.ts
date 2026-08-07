import { expect, test } from '@playwright/test';

test('the signature article renders as Sam handwich', async ({ page }) => {
  const response = await page.goto('/wiki/Ham_sandwich');
  expect(response?.status()).toBe(200);

  await expect(page).toHaveTitle(/Sam handwich - Pikiwedia/);
  await expect(page.locator('#firstHeading')).toHaveText('Sam handwich');
  await expect(page.locator('.mw-logo-wordmark').first()).toContainText('IKIWEDI');
  await expect(page.locator('#pikiwedia-credit')).toContainText('parody of Wikipedia');
});

test('the desktop tagline reads as the parody', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the mobile skin has no tagline or subtitle');
  await page.goto('/wiki/Ham_sandwich');
  await expect(page.locator('#siteSub')).toContainText('From Pikiwedia');
  await expect(page.locator('.mw-logo-tagline')).toContainText('Lee Enfrycodepia');
});

test('the lead paragraph is transmuted but still readable', async ({ page }) => {
  await page.goto('/wiki/Ham_sandwich');
  const lead = await page.locator('#mw-content-text p').first().innerText();
  expect(lead).toContain('sam handwich');
  expect(lead).not.toContain('ham sandwich');
  expect(lead.length).toBeGreaterThan(80);
});

test('the licence notice is left untouched', async ({ page }) => {
  await page.goto('/wiki/Ham_sandwich');
  // Vector spells out Creative Commons, Minerva abbreviates it; either way the
  // wording must survive verbatim rather than being transmuted.
  const licence = page.locator('#footer-info-copyright');
  await expect(licence).toContainText(/Creative Commons Attribution|CC BY-SA/);
  await expect(licence).toContainText(/available under/);
  await expect(licence).toHaveAttribute('id', 'footer-info-copyright');
});

test('citations survive', async ({ page }) => {
  await page.goto('/wiki/Ham_sandwich');
  await expect(page.locator('sup.reference').first()).toBeAttached();
});

test('browsing stays on Pikiwedia and lands on a transmuted article', async ({ page }) => {
  await page.goto('/wiki/Cheese');
  const host = new URL(page.url()).host;
  const link = page.locator('#mw-content-text p a[href^="/wiki/"]:not([href*=":"])').first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForLoadState('domcontentloaded');
  expect(new URL(page.url()).host).toBe(host);
  expect(new URL(page.url()).pathname).toMatch(/^\/wiki\//);
  await expect(page.locator('#firstHeading')).not.toBeEmpty();
});

test('the root redirects to the transmuted Main Page', async ({ page }) => {
  await page.goto('/');
  expect(new URL(page.url()).pathname).toBe('/wiki/Main_Page');
  await expect(page.locator('.mw-logo-wordmark')).toContainText('IKIWEDI');
});

test('the same article transmutes identically on a second fetch', async ({ request }) => {
  const lead = (body: string) => /<p\b[^>]*>([\s\S]*?)<\/p>/g.exec(body)?.[0] ?? '';
  const first = lead(await (await request.get('/wiki/Ham_sandwich')).text());
  const second = lead(await (await request.get('/wiki/Ham_sandwich')).text());
  expect(first).not.toBe('');
  expect(second).toBe(first);
});

test('clicking a search suggestion lands on the article it names', async ({ request }) => {
  const suggestions = await (
    await request.get('/w/rest.php/v1/search/title?q=grape%20juice&limit=3')
  ).json();
  const first = suggestions.pages[0];
  expect(first.key).toBeTruthy();

  const click = await request.get(
    `/w/index.php?title=Special%3ASearch&search=${encodeURIComponent(first.title)}&wprov=acrw1_0`,
    { maxRedirects: 0 },
  );
  expect(click.status()).toBe(302);
  expect(click.headers()['location']).toContain(`/wiki/${first.key}`);
});

test("Wikipedia's own stylesheets load, so the page looks like Wikipedia", async ({ page }) => {
  await page.goto('/wiki/Ham_sandwich');
  await page.waitForLoadState('networkidle');
  const sheets = await page.evaluate(
    () => document.querySelectorAll('link[rel="stylesheet"]').length,
  );
  expect(sheets).toBeGreaterThan(0);
  const styled = await page.evaluate(() => {
    const h1 = document.querySelector('#firstHeading');
    return h1 ? getComputedStyle(h1).fontSize : '';
  });
  expect(parseFloat(styled)).toBeGreaterThan(20);
});
