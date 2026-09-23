import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

async function load(relative) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
}
const { resolvePlaygroundHref, playgroundTransitionResponse } = await load('../lib/playground-urls.ts');
const { createPlaygroundBackup } = await load('../lib/playground-backup.ts');
const origin = 'https://playground.ai-sdk.dev';

test('legacy pages preserve model encoding, share IDs, queries, and fragments', () => {
  for (const [from, to] of [
    ['/playground', '/'], ['/playground/', '/'], ['/play', '/'], ['/prompt', '/'],
    ['/playground/s/share-123?q=1#last', '/s/share-123?q=1#last'],
    ['/playground/openai:gpt%2F4,anthropic:claude?input=hello%20world', '/openai:gpt%2F4,anthropic:claude?input=hello%20world'],
    ['/user', '/user'], ['/user/models', '/user/models'], ['/s/share-123', '/s/share-123'],
    ['/r/old?foo=bar', '/?foo=bar'], ['/playground/r/old', '/'],
  ]) assert.equal(resolvePlaygroundHref(from), `${origin}${to}`);
  for (const href of ['/playground-recovery', '/docs/playground', '/api/chat', '//evil.test', 'https://example.com/playground']) {
    assert.equal(resolvePlaygroundHref(href), undefined);
  }
});

test('temporary page and feed redirects only accept reads', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = playgroundTransitionResponse(new Request('https://ai-sdk.dev/playground/s/abc?foo=bar', { method }));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), `${origin}/s/abc?foo=bar`);
  }
  const feed = playgroundTransitionResponse(new Request('https://ai-sdk.dev/api/model-feed'));
  assert.equal(feed.headers.get('location'), `${origin}/api/model-feed`);
  for (const path of ['/playground', '/playground/s/abc', '/api/generate', '/api/upload', '/api/chats/abc', '/api/model-feed']) {
    const response = playgroundTransitionResponse(new Request(`https://ai-sdk.dev${path}`, { method: 'POST', headers: { 'next-action': 'old-action' }, body: 'private draft' }));
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(!(await response.text()).includes('private draft'));
  }
  const callback = playgroundTransitionResponse(new Request('https://ai-sdk.dev/api/auth/callback/vercel?code=secret'));
  assert.equal(callback.status, 410);
  assert.ok(!(await callback.text()).includes('secret'));
  assert.equal(playgroundTransitionResponse(new Request('https://ai-sdk.dev/api/chat', {method: 'POST'})), undefined);
});

test('export preserves raw persisted data and excludes authentication', () => {
  const data = new Map([['ai-playground-editor-layout-137', '["0"]'], ['pre-auth-input', 'draft'], ['auth-user', 'secret'], ['site-theme', 'dark']]);
  const storage = { length: data.size, key: i => [...data.keys()][i], getItem: key => data.get(key) ?? null };
  const result = createPlaygroundBackup(storage, 'https://ai-sdk.dev');
  assert.equal(result.count, 2);
  const backup = JSON.parse(result.backup);
  assert.equal(backup.type, 'ai-sdk-playground-browser-state');
  assert.equal(backup.version, 1);
  assert.deepEqual(backup.entries, [...data.entries()].slice(0, 2));
  assert.ok(!result.backup.includes('secret'));
});
