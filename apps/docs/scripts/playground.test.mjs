import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

async function load(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  return import(
    `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
  );
}

const { PLAYGROUND_ORIGIN, playgroundTransitionResponse, resolvePlaygroundHref } =
  await load('../lib/playground-urls.ts');
const { createPlaygroundBackup } = await load('../lib/playground-backup.ts');

test('legacy playground links preserve public URL details', () => {
  for (const [source, destination] of [
    ['/playground', '/'],
    ['/playground/', '/'],
    ['/play', '/'],
    ['/prompt', '/'],
    ['/playground/s/share-123?q=1#last', '/s/share-123?q=1#last'],
    [
      '/playground/openai:gpt%2F4,anthropic:claude?input=hello%20world',
      '/openai:gpt%2F4,anthropic:claude?input=hello%20world',
    ],
    ['/user', '/user'],
    ['/user/models', '/user/models'],
    ['/s/share-123', '/s/share-123'],
    ['/r/old?foo=bar', '/?foo=bar'],
    ['/playground/r/old', '/'],
  ]) {
    assert.equal(resolvePlaygroundHref(source), `${PLAYGROUND_ORIGIN}${destination}`);
  }

  for (const href of [
    '/playground-recovery',
    '/docs/playground',
    '/api/chat',
    '//evil.test',
    'https://example.com/playground',
  ]) {
    assert.equal(resolvePlaygroundHref(href), undefined);
  }
});

test('legacy pages and public resources redirect only read requests', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = playgroundTransitionResponse(
      new Request('https://ai-sdk.dev/playground/s/abc?foo=bar', { method }),
    );
    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get('location'),
      `${PLAYGROUND_ORIGIN}/s/abc?foo=bar`,
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }

  const feed = playgroundTransitionResponse(
    new Request('https://ai-sdk.dev/api/model-feed?version=7'),
  );
  assert.equal(feed.status, 307);
  assert.equal(
    feed.headers.get('location'),
    `${PLAYGROUND_ORIGIN}/api/model-feed?version=7`,
  );

  for (const path of [
    '/playground',
    '/playground/s/abc',
    '/api/generate',
    '/api/upload',
    '/api/chats/abc',
    '/api/model-feed',
  ]) {
    const response = playgroundTransitionResponse(
      new Request(`https://ai-sdk.dev${path}`, {
        method: 'POST',
        headers: { 'next-action': 'old-action' },
        body: 'private draft',
      }),
    );
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).playground, PLAYGROUND_ORIGIN);
  }

  assert.equal(
    playgroundTransitionResponse(
      new Request('https://ai-sdk.dev/api/chat', { method: 'POST' }),
    ),
    undefined,
  );
  assert.equal(
    playgroundTransitionResponse(
      new Request('https://ai-sdk.dev/api/search?query=streamText'),
    ),
    undefined,
  );
});

test('the temporary OAuth callback relay preserves provider parameters', async () => {
  const response = playgroundTransitionResponse(
    new Request(
      'https://ai-sdk.dev/api/auth/callback/vercel?code=a%2Fb&state=state-1&error=denied',
    ),
  );

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get('location'),
    `${PLAYGROUND_ORIGIN}/api/auth/callback/vercel?code=a%2Fb&state=state-1&error=denied`,
  );
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(await response.text(), '');

  const mutation = playgroundTransitionResponse(
    new Request('https://ai-sdk.dev/api/auth/callback/vercel?code=secret', {
      method: 'POST',
      body: 'verifier',
    }),
  );
  assert.equal(mutation.status, 410);
  assert.doesNotMatch(await mutation.text(), /secret|verifier/);
});

test('browser recovery exports supported state and excludes authentication', () => {
  const data = new Map([
    ['ai-playground-editor-layout-137', '["0"]'],
    ['ai-playground-editor-chat-137_panel-1', '{"model":"openai/gpt-5"}'],
    ['pre-auth-input', 'draft'],
    ['pre-auth-attachments', '["blob-url"]'],
    ['ai-playground-editor-chat-137_../cookie', 'invalid'],
    ['auth-user', 'secret'],
    ['site-theme', 'dark'],
  ]);
  const storage = {
    length: data.size,
    key: index => [...data.keys()][index],
    getItem: key => data.get(key) ?? null,
  };

  const result = createPlaygroundBackup(storage, 'https://ai-sdk.dev');
  const backup = JSON.parse(result.backup);

  assert.equal(result.count, 4);
  assert.equal(backup.type, 'ai-sdk-playground-browser-state');
  assert.equal(backup.version, 1);
  assert.equal(backup.sourceOrigin, 'https://ai-sdk.dev');
  assert.deepEqual(
    backup.entries.map(([key]) => key),
    [
      'ai-playground-editor-layout-137',
      'ai-playground-editor-chat-137_panel-1',
      'pre-auth-input',
      'pre-auth-attachments',
    ],
  );
  assert.doesNotMatch(result.backup, /secret|site-theme|\.\.\/cookie/);
});
