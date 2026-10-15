import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, expect } from '@playwright/test';

const baseURL = process.env.DOCS_TEST_URL ?? 'http://localhost:3217';
let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

const versionOf = url => {
  const segment = new URL(url, baseURL).pathname.split('/')[1];
  return segment === 'v5' || segment === 'v6' ? segment : 'v7';
};

test('search follows client-side version changes and preserves the query', async t => {
  const page = await browser.newPage();
  t.after(() => page.close());
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(180_000);
  const responses = new Map();
  page.on('response', async response => {
    const url = new URL(response.url());
    if (url.pathname === '/api/search' && url.searchParams.get('query') === 'streamText') {
      const results = await response.json();
      if (results.length > 0) responses.set(versionOf(results[0].url), results);
    }
  });
  await page.goto(`${baseURL}/docs/introduction`);
  // A document navigation would hide the client-cache regression.
  await page.evaluate(() => { window.searchRegressionDocument = true; });

  let initialSearch = true;
  for (const version of ['v7', 'v6', 'v5', 'v7', 'v6']) {
    if (versionOf(page.url()) !== version) {
      await page.getByRole('button', { name: 'Select documentation version' }).click();
      await page.getByRole('menuitem', { name: new RegExp(`^${version} `) }).click();
      await page.waitForURL(url => versionOf(url) === version);
    }

    await page.getByRole('button', { name: /Search…/ }).click();
    const input = page.getByRole('dialog').getByRole('textbox');
    if (initialSearch) {
      await input.fill('streamText');
      initialSearch = false;
    }
    assert.equal(await input.inputValue(), 'streamText');

    const results = page.getByRole('listbox', { name: 'Search results' }).getByRole('option');
    await results.first().waitFor();
    // Scope changes must issue a request (or reuse that version's cached one).
    await expect.poll(() => responses.has(version), {
      message: `expected search results for ${version}`,
      timeout: 15_000,
    }).toBe(true);
    assert.ok(responses.get(version).every(result => versionOf(result.url) === version));
    await expect(results).toHaveCount(responses.get(version).length);
    await results.first().click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForURL(url => versionOf(url) === version);
    assert.equal(versionOf(page.url()), version);
    assert.equal(await page.evaluate(() => window.searchRegressionDocument), true);
  }
});

test('explicit search scope wins over Referer and returns results without a Referer', async () => {
  for (const version of ['v5', 'v6', 'v7']) {
    for (const referer of [undefined, `${baseURL}/v5/docs/introduction`]) {
      const response = await fetch(`${baseURL}/api/search?query=streamText&locale=en&tag=${version}`, {
        headers: referer ? { referer } : {},
      });
      assert.equal(response.status, 200);
      const results = await response.json();
      assert.ok(results.length > 0, `${version} should have search results`);
      assert.ok(results.every(result => versionOf(result.url) === version));
    }
  }
});

test('unscoped search keeps the Referer fallback', async () => {
  for (const [referer, version] of [
    [undefined, 'v7'],
    ['not a URL', 'v7'],
    [`${baseURL}/v5/providers/ai-sdk-providers`, 'v5'],
    [`${baseURL}/v6/cookbook/next/stream-text`, 'v6'],
    [`${baseURL}/docs/introduction`, 'v7'],
  ]) {
    const response = await fetch(`${baseURL}/api/search?query=streamText&locale=en`, {
      headers: referer ? { referer } : {},
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('vary'), /Referer/i);
    const results = await response.json();
    assert.ok(results.length > 0);
    assert.ok(results.every(result => versionOf(result.url) === version));
  }
});
