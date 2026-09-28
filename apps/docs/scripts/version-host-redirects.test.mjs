import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
// Initialize the Next.js runtime globals before loading its testing utilities.
import 'next/dist/server/node-environment-baseline.js';
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server.js';

const source = await readFile(
  new URL('../lib/version-host-redirects.ts', import.meta.url),
  'utf8',
);
const { versionHostRedirects } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
);
const responseFor = url => unstable_getResponseFromNextConfig({
  url,
  nextConfig: { redirects: () => versionHostRedirects },
});

test('version hostnames redirect their roots and deep links to the canonical version', async () => {
  for (const version of ['v5', 'v6']) {
    for (const [path, destination] of [
      ['/', `/${version}/docs/introduction`],
      ['/docs/introduction', `/${version}/docs/introduction`],
      ['/docs/ai-sdk-core/generating-text', `/${version}/docs/ai-sdk-core/generating-text`],
      ['/providers/ai-sdk-providers/openai', `/${version}/providers/ai-sdk-providers/openai`],
      ['/cookbook/next/stream-text', `/${version}/cookbook/next/stream-text`],
      ['/resources/recipes/node/stream-text', `/${version}/resources/recipes/node/stream-text`],
      ['/docs/encoded%2Fpath.md', `/${version}/docs/encoded%2Fpath.md`],
    ]) {
      const response = await responseFor(`https://${version}.ai-sdk.dev${path}`);
      assert.equal(response.status, 307);
      assert.equal(getRedirectUrl(response), `https://ai-sdk.dev${destination}`);
    }
  }
});

test('explicit version prefixes are preserved without adding another version', async () => {
  for (const hostnameVersion of ['v5', 'v6']) {
    for (const pathVersion of ['v4', 'v5', 'v6', 'v7']) {
      for (const path of [`/${pathVersion}`, `/${pathVersion}/docs/introduction`]) {
        const response = await responseFor(`https://${hostnameVersion}.ai-sdk.dev${path}`);
        assert.equal(response.status, 307);
        assert.equal(getRedirectUrl(response), `https://ai-sdk.dev${path}`);
      }
    }
  }
});

test('query parameters survive both prefixed and unprefixed redirects', async () => {
  for (const version of ['v5', 'v6']) {
    for (const path of ['/', '/docs/introduction', `/${version}/docs/introduction`]) {
      const response = await responseFor(
        `https://${version}.ai-sdk.dev${path}?q=hello%20world&returnTo=%2Fdocs%3Fx%3D1&empty=`,
      );
      const destination = new URL(getRedirectUrl(response));
      assert.equal(destination.searchParams.get('q'), 'hello world');
      assert.equal(destination.searchParams.get('returnTo'), '/docs?x=1');
      assert.equal(destination.searchParams.get('empty'), '');
    }
  }
});

test('version-like path names still receive their hostname version prefix', async () => {
  const response = await responseFor('https://v6.ai-sdk.dev/v6-guide');
  assert.equal(getRedirectUrl(response), 'https://ai-sdk.dev/v6/v6-guide');
});

test('canonical, preview, archived, and lookalike hosts are not redirected', async () => {
  for (const hostname of [
    'ai-sdk.dev',
    'ai-sdk-docs.vercel.sh',
    'localhost:3000',
    'v4.ai-sdk.dev',
    'v7.ai-sdk.dev',
    'www.ai-sdk.dev',
    'playground.ai-sdk.dev',
    'v5Xai-sdkXdev',
    'v6.ai-sdk.dev.example.com',
  ]) {
    const response = await responseFor(`https://${hostname}/docs/introduction`);
    assert.equal(response.status, 200, hostname);
    assert.equal(getRedirectUrl(response), null, hostname);
  }
});
