import assert from 'node:assert/strict';
import { test } from 'node:test';

const baseURL = process.env.DOCS_TEST_URL ?? 'http://localhost:3217';

// Exercise the compiled site's actual content and search route. Run after
// starting the docs app: node --test scripts/search-relevance.e2e.mjs
const cases = [
  ['streamText', '/docs/reference/ai-sdk-core/stream-text'],
  ['STREAMTEXT', '/docs/reference/ai-sdk-core/stream-text'],
  ['streamText()', '/docs/reference/ai-sdk-core/stream-text'],
  ['generateText', '/docs/reference/ai-sdk-core/generate-text'],
  ['embed', '/docs/reference/ai-sdk-core/embed'],
  ['embedMany', '/docs/reference/ai-sdk-core/embed-many'],
  ['generateImage', '/docs/reference/ai-sdk-core/generate-image'],
  ['generateSpeech', '/docs/reference/ai-sdk-core/generate-speech'],
  ['transcribe', '/docs/reference/ai-sdk-core/transcribe'],
  ['tool', '/docs/reference/ai-sdk-core/tool'],
  ['toolSearch', '/docs/reference/ai-sdk-core/tool-search'],
  ['createMCPClient', '/docs/reference/ai-sdk-core/create-mcp-client'],
  ['jsonSchema', '/docs/reference/ai-sdk-core/json-schema'],
  ['zodSchema', '/docs/reference/ai-sdk-core/zod-schema'],
  ['ToolLoopAgent', '/docs/reference/ai-sdk-core/tool-loop-agent'],
  ['Output', '/docs/reference/ai-sdk-core/output'],
  ['createProviderRegistry', '/docs/reference/ai-sdk-core/provider-registry'],
  ['wrapLanguageModel', '/docs/reference/ai-sdk-core/wrap-language-model'],
  ['useChat', '/docs/reference/ai-sdk-ui/use-chat'],
  ['useCompletion', '/docs/reference/ai-sdk-ui/use-completion'],
  ['useObject', '/docs/reference/ai-sdk-ui/use-object'],
  ['structured output', '/docs/ai-sdk-core/generating-structured-data'],
  ['structured outputs', '/docs/ai-sdk-core/generating-structured-data'],
  ['tool calling', '/docs/ai-sdk-core/tools-and-tool-calling'],
  ['agents', '/docs/agents/overview'],
  ['mcp', '/docs/ai-sdk-core/mcp-tools'],
  ['embeddings', '/docs/ai-sdk-core/embeddings'],
  ['text generation', '/docs/ai-sdk-core/generating-text'],
  ['streaming text', '/docs/ai-sdk-core/generating-text'],
  ['image generation', '/docs/ai-sdk-core/image-generation'],
  ['text to speech', '/docs/ai-sdk-core/speech'],
  ['speech to text', '/docs/ai-sdk-core/transcription'],
  ['telemetry', '/docs/ai-sdk-core/telemetry'],
  ['claude', '/providers/ai-sdk-providers/anthropic'],
  ['claude sonnet', '/providers/ai-sdk-providers/anthropic'],
  ['gemini', '/providers/ai-sdk-providers/google'],
  ['gemini flash', '/providers/ai-sdk-providers/google'],
  ['using gemini flash', '/providers/ai-sdk-providers/google'],
  ['Apertis', '/providers/community-providers/apertis'],
  ['outputType', '/providers/ai-sdk-providers/alibaba'],
  [
    'maximum update depth exceeded',
    '/docs/troubleshooting/react-maximum-update-depth-exceeded',
  ],
];

for (const [query, expected] of cases) {
  test(`search ranks the canonical page first for ${JSON.stringify(query)}`, async () => {
    const params = new URLSearchParams({ query, locale: 'en', tag: 'v7' });
    const response = await fetch(`${baseURL}/api/search?${params}`);
    assert.equal(response.status, 200);
    const results = await response.json();
    const pages = results.filter(result => result.type === 'page');
    assert.equal(pages[0]?.url, expected);
    assert.ok(pages.length <= 20);
    assert.ok(results.length <= 60);
    assert.equal(new Set(pages.map(page => page.url)).size, pages.length);
  });
}

test('how-to queries put exact recipe titles and the core guide first', async () => {
  const params = new URLSearchParams({
    query: 'how to stream text',
    locale: 'en',
    tag: 'v7',
  });
  const response = await fetch(`${baseURL}/api/search?${params}`);
  assert.equal(response.status, 200);
  const pages = (await response.json()).filter(result => result.type === 'page');
  assert.deepEqual(
    new Set(pages.slice(0, 4).map(page => page.url)),
    new Set([
      '/cookbook/next/stream-text',
      '/cookbook/node/stream-text',
      '/cookbook/rsc/stream-text',
      '/docs/ai-sdk-core/generating-text',
    ]),
  );
});

test('exact API lookup remains scoped to the selected docs version', async () => {
  for (const version of ['v5', 'v6', 'v7']) {
    const params = new URLSearchParams({
      query: 'streamText',
      locale: 'en',
      tag: version,
    });
    const response = await fetch(`${baseURL}/api/search?${params}`);
    assert.equal(response.status, 200);
    const results = await response.json();
    const prefix = version === 'v7' ? '' : `/${version}`;
    assert.equal(
      results[0]?.url,
      `${prefix}/docs/reference/ai-sdk-core/stream-text`,
    );
    assert.ok(
      results.every(result => {
        const segment = new URL(result.url, baseURL).pathname.split('/')[1];
        return (segment === 'v5' || segment === 'v6' ? segment : 'v7') === version;
      }),
    );
  }
});
