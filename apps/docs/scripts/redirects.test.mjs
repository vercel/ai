import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = await readFile(
  new URL('../lib/legacy-redirects.ts', import.meta.url),
  'utf8',
);
const { legacyRedirects } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
);
const redirects = new Map(legacyRedirects.map(redirect => [redirect.source, redirect]));

test('legacy redirects preserve representative production destinations', () => {
  for (const [source, destination, permanent] of [
    ['/docs', '/docs/introduction', true],
    ['/docs/guides/rag-chatbot', '/cookbook/guides/rag-chatbot', true],
    ['/docs/ai-core/generate-text', '/docs/ai-sdk-core/generate-text', true],
    ['/docs/api-reference/use-chat', '/docs/reference/ai-sdk-ui/use-chat', true],
    ['/docs/fundamentals/prompts', '/docs/foundations/prompts', true],
    ['/providers/legacy-providers/fireworks', '/providers/ai-sdk-providers/fireworks', true],
    [
      '/docs/providers/ai-sdk-providers/google-geneative-ai',
      '/providers/ai-sdk-providers/google',
      true,
    ],
    ['/api/object', '/docs/reference/ai-sdk-ui/use-object', true],
    ['/getting-started/nextjs-app-router', '/docs/getting-started/nextjs-app-router', true],
    ['/repo', 'https://github.com/vercel/ai', false],
    ['/stream-data', '/docs/reference/ai-sdk-ui/stream-data', true],
  ]) {
    assert.deepEqual(redirects.get(source), { source, destination, permanent });
  }
});

test('legacy redirects are unique and cannot capture live or migrated routes', () => {
  assert.equal(legacyRedirects.length, 283);
  assert.equal(redirects.size, legacyRedirects.length);

  for (const source of [
    '/api/chat',
    '/api/search',
    '/playground',
    '/play',
    '/prompt',
    '/s/:path*',
    '/user',
  ]) {
    assert.equal(redirects.has(source), false);
  }
});
