import { test, expect } from '@playwright/test';

test('createStreamableValue() and readStreamableValue()', async ({ page }) => {
  await page.goto('/streamable');
  await page.click('#test-streamable-value');

  const logs = page.locator('#log');
  await expect(logs).toHaveText(
    '["hello","hello, world","hello, world!",{"value":"I am a JSON"},["Finished"]]',
  );
});

test('createStreamableUI()', async ({ page }) => {
  await page.goto('/streamable');
  await page.click('#test-streamable-ui');

  const logs = page.locator('#log');

  // It should update the UI but reuse the same component instance and its state
  // to avoid re-mounting.
  await expect(logs).toHaveText('(Rendered 1 times)I am a button');
});

test('createStreamableUI() .append() method', async ({ page }) => {
  await page.goto('/streamable');
  await page.click('#test-streamable-ui-append');

  const logs = page.locator('#log');
  await expect(logs).toHaveText('foobar');
});
