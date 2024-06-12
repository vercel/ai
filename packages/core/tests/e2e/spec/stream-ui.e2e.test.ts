import { test, expect } from '@playwright/test';

test('streamUI() with text', async ({ page }) => {
  await page.goto('/stream-ui');
  await page.click('#test-streamui-text');

  const logs = page.locator('#log');
  await expect(logs).toHaveText('"Hello, world!"');
});

test('streamUI() with wrapped text', async ({ page }) => {
  await page.goto('/stream-ui');
  await page.click('#test-streamui-wrapped-text');

  const logs = page.locator('#log');
  await expect(logs).toHaveText('AI: "Hello, world!"');
});

test('streamUI() with tool call', async ({ page }) => {
  await page.goto('/stream-ui');
  await page.click('#test-streamui-tool');

  const logs = page.locator('#log');
  await expect(logs).toHaveText('tool1: value');
});
