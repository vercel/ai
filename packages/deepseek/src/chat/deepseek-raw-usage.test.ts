import type { JSONObject, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createDeepSeek({ apiKey: 'test-api-key' });
const server = createTestServer({
  'https://api.deepseek.com/chat/completions': {},
});

type LiveUsageFixture = {
  model: string;
  json: JSONObject;
  stream: JSONObject[];
};

const liveUsageFixture = JSON.parse(
  fs.readFileSync('src/chat/__fixtures__/issue-19789-live-usage.json', 'utf8'),
) as LiveUsageFixture;

function withSentinels(usage: JSONObject): JSONObject {
  return {
    ...usage,
    top_level_sentinel: 'top-level',
    prompt_tokens_details: {
      ...(usage.prompt_tokens_details as JSONObject),
      prompt_nested_sentinel: 'prompt',
    },
    completion_tokens_details: {
      ...(usage.completion_tokens_details as JSONObject),
      completion_nested_sentinel: 'completion',
    },
  };
}

function prepareJsonResponse(usage: JSONObject) {
  server.urls['https://api.deepseek.com/chat/completions'].response = {
    type: 'json-value',
    body: {
      id: 'issue-19789-json',
      object: 'chat.completion',
      created: 0,
      model: liveUsageFixture.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'OK' },
          finish_reason: 'stop',
        },
      ],
      usage,
    },
  };
}

function prepareStreamResponse(usages: JSONObject[]) {
  const chunks = [
    {
      id: 'issue-19789-stream',
      object: 'chat.completion.chunk',
      created: 0,
      model: liveUsageFixture.model,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: 'OK' },
          finish_reason: null,
        },
      ],
      usage: null,
    },
    {
      id: 'issue-19789-stream',
      object: 'chat.completion.chunk',
      created: 0,
      model: liveUsageFixture.model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: null,
    },
    ...usages.map(usage => ({
      id: 'issue-19789-stream',
      object: 'chat.completion.chunk',
      created: 0,
      model: liveUsageFixture.model,
      choices: [],
      usage,
    })),
  ];

  server.urls['https://api.deepseek.com/chat/completions'].response = {
    type: 'stream-chunks',
    chunks: [
      ...chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
      'data: [DONE]\n\n',
    ],
  };
}

describe('DeepSeek complete raw usage', () => {
  it('preserves the complete JSON usage object without changing normalized counts', async () => {
    const usage = withSentinels(liveUsageFixture.json);
    prepareJsonResponse(usage);

    const result = await provider.chat(liveUsageFixture.model).doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(result.usage).toStrictEqual({
      inputTokens: {
        total: 88,
        noCache: 88,
        cacheRead: 0,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 28,
        text: 2,
        reasoning: 26,
      },
      raw: usage,
    });
  });

  it('preserves the complete final streaming usage object and raw event order', async () => {
    const finalUsage = withSentinels(liveUsageFixture.stream.at(-1)!);
    const earlierUsage: JSONObject = {
      prompt_tokens: 10,
      completion_tokens: 2,
      total_tokens: 12,
      prompt_tokens_details: { cached_tokens: 1 },
      completion_tokens_details: { reasoning_tokens: 1 },
      prompt_cache_hit_tokens: 1,
      prompt_cache_miss_tokens: 9,
      top_level_sentinel: 'earlier',
    };
    prepareStreamResponse([earlierUsage, finalUsage]);

    const result = await provider.chat(liveUsageFixture.model).doStream({
      prompt: TEST_PROMPT,
      includeRawChunks: true,
    });
    const parts = await convertReadableStreamToArray(result.stream);
    const rawUsages = parts
      .filter(part => part.type === 'raw')
      .map(part => (part.rawValue as { usage?: JSONObject }).usage)
      .filter((usage): usage is JSONObject => usage != null);
    const finish = parts.find(part => part.type === 'finish');

    expect(rawUsages).toStrictEqual([earlierUsage, finalUsage]);
    expect(finish).toMatchObject({
      type: 'finish',
      usage: {
        inputTokens: {
          total: 88,
          noCache: 88,
          cacheRead: 0,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 25,
          text: 2,
          reasoning: 23,
        },
        raw: finalUsage,
      },
    });
  });

  it('continues to reject invalid known JSON usage fields', async () => {
    prepareJsonResponse({
      ...liveUsageFixture.json,
      prompt_tokens: 'invalid',
    });

    await expect(
      provider.chat(liveUsageFixture.model).doGenerate({
        prompt: TEST_PROMPT,
      }),
    ).rejects.toThrow();
  });

  it('validates prompt_tokens_details.cached_tokens on JSON responses', async () => {
    prepareJsonResponse({
      ...liveUsageFixture.json,
      prompt_tokens_details: { cached_tokens: 'invalid' },
    });

    await expect(
      provider.chat(liveUsageFixture.model).doGenerate({
        prompt: TEST_PROMPT,
      }),
    ).rejects.toThrow();
  });

  it('continues to reject invalid known streaming usage fields', async () => {
    prepareStreamResponse([
      {
        ...liveUsageFixture.stream.at(-1)!,
        completion_tokens_details: { reasoning_tokens: 'invalid' },
      },
    ]);

    const result = await provider.chat(liveUsageFixture.model).doStream({
      prompt: TEST_PROMPT,
    });
    const parts = await convertReadableStreamToArray(result.stream);

    expect(parts.some(part => part.type === 'error')).toBe(true);
  });

  it('validates prompt_tokens_details.cached_tokens on streaming responses', async () => {
    prepareStreamResponse([
      {
        ...liveUsageFixture.stream.at(-1)!,
        prompt_tokens_details: { cached_tokens: 'invalid' },
      },
    ]);

    const result = await provider.chat(liveUsageFixture.model).doStream({
      prompt: TEST_PROMPT,
    });
    const parts = await convertReadableStreamToArray(result.stream);

    expect(parts.some(part => part.type === 'error')).toBe(true);
  });
});
