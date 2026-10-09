import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { mockId } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

type WebSearchFixture = {
  output: Array<{
    type: string;
    action?: {
      sources?: Array<
        { type: 'url'; url: string } | { type: string; [key: string]: unknown }
      >;
    };
    [key: string]: unknown;
  }>;
};

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const fixture = JSON.parse(
  fs.readFileSync(
    'src/responses/__fixtures__/openai-web-search-tool.1.json',
    'utf8',
  ),
) as WebSearchFixture;

const server = createTestServer({
  'https://api.openai.com/v1/responses': {
    response: {
      type: 'json-value',
      body: fixture,
    },
  },
});

function normalizeUrl(value: string) {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}

it('exposes all OpenAI web search action sources as source content', async () => {
  const model = new OpenAIResponsesLanguageModel('gpt-5-mini', {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
  });

  const result = await model.doGenerate({
    prompt: TEST_PROMPT,
    tools: [
      {
        type: 'provider',
        id: 'openai.web_search',
        name: 'webSearch',
        args: {},
      },
    ],
  });

  expect(server.calls).toHaveLength(1);

  const providerSourceUrls = new Set(
    fixture.output
      .filter(part => part.type === 'web_search_call')
      .flatMap(part => part.action?.sources ?? [])
      .filter(
        (source): source is { type: 'url'; url: string } =>
          source.type === 'url',
      )
      .map(source => normalizeUrl(source.url)),
  );

  const sdkSourceUrls = new Set(
    result.content
      .filter(part => part.type === 'source' && part.sourceType === 'url')
      .map(source => normalizeUrl(source.url)),
  );

  const missingProviderSources = [...providerSourceUrls].filter(
    url => !sdkSourceUrls.has(url),
  );

  expect(missingProviderSources).toEqual([]);
});
