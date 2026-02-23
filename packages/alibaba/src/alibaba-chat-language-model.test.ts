import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAlibaba } from './alibaba-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

vi.mock('@ai-sdk/provider-utils', async importOriginal => {
  const mod = await importOriginal<typeof import('@ai-sdk/provider-utils')>();
  return { ...mod, generateId: () => 'test-reasoning-id' };
});

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const CHAT_COMPLETIONS_URL =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

const provider = createAlibaba({ apiKey: 'test-api-key' });
const model = provider.chatModel('qwen-plus');
const server = createTestServer({ [CHAT_COMPLETIONS_URL]: {} });

describe('doGenerate', () => {
  function prepareJsonFixtureResponse(filename: string) {
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(`src/__fixtures__/${filename}.json`, 'utf8'),
      ),
    };
  }

  describe('text', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('alibaba-text');
    });

    it('should extract text content', async () => {
      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result).toMatchSnapshot();
    });

    it('should send correct request body', async () => {
      await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "model": "qwen-plus",
        }
      `);
    });
  });

  describe('tool call', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('alibaba-tool-call');
    });

    it('should extract tool call content', async () => {
      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result).toMatchSnapshot();
    });
  });

  describe('reasoning', () => {
    beforeEach(() => {
      prepareJsonFixtureResponse('alibaba-reasoning');
    });

    it('should extract reasoning content', async () => {
      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(result).toMatchSnapshot();
    });

    it('should extract usage with reasoning tokens', async () => {
      const { usage } = await model.doGenerate({
        prompt: TEST_PROMPT,
      });

      expect(usage).toMatchInlineSnapshot(`
        {
          "cachedInputTokens": 0,
          "inputTokens": 24,
          "outputTokens": 1668,
          "reasoningTokens": 1353,
          "totalTokens": 1692,
        }
      `);
    });
  });

  it('should extract usage with cache tokens', async () => {
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'json-value',
      body: {
        id: 'chatcmpl-cache-test',
        object: 'chat.completion',
        created: 1770764844,
        model: 'qwen-plus',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: {
            cached_tokens: 80,
            cache_creation_input_tokens: 20,
          },
          completion_tokens_details: {
            reasoning_tokens: 10,
          },
        },
      },
    };

    const { usage, providerMetadata } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(usage).toMatchInlineSnapshot(`
      {
        "cachedInputTokens": 80,
        "inputTokens": 100,
        "outputTokens": 50,
        "reasoningTokens": 10,
        "totalTokens": 150,
      }
    `);

    expect(providerMetadata).toEqual({
      alibaba: { cacheCreationInputTokens: 20 },
    });
  });

  it('should send enable_thinking in request body', async () => {
    prepareJsonFixtureResponse('alibaba-text');

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        alibaba: {
          enableThinking: true,
          thinkingBudget: 2048,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'qwen-plus',
      enable_thinking: true,
      thinking_budget: 2048,
    });
  });
});

describe('doStream', () => {
  function prepareChunksFixtureResponse(filename: string) {
    const chunks = fs
      .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => `data: ${line}\n\n`);
    chunks.push('data: [DONE]\n\n');

    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'stream-chunks',
      chunks,
    };
  }

  describe('text', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('alibaba-text');
    });

    it('should stream text', async () => {
      const result = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(
        await convertReadableStreamToArray(result.stream),
      ).toMatchSnapshot();
    });
  });

  describe('tool call', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('alibaba-tool-call');
    });

    it('should stream tool call', async () => {
      const result = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(
        await convertReadableStreamToArray(result.stream),
      ).toMatchSnapshot();
    });
  });

  describe('reasoning', () => {
    beforeEach(() => {
      prepareChunksFixtureResponse('alibaba-reasoning');
    });

    it('should stream reasoning', async () => {
      const result = await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(
        await convertReadableStreamToArray(result.stream),
      ).toMatchSnapshot();
    });
  });

  it('should include cacheCreationInputTokens in finish providerMetadata', async () => {
    const usageChunk = JSON.stringify({
      id: 'chatcmpl-cache-stream-test',
      object: 'chat.completion.chunk',
      created: 1770764844,
      model: 'qwen-plus',
      choices: [],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        prompt_tokens_details: {
          cached_tokens: 80,
          cache_creation_input_tokens: 20,
        },
        completion_tokens_details: { reasoning_tokens: 10 },
      },
    });
    const contentChunk = JSON.stringify({
      id: 'chatcmpl-cache-stream-test',
      object: 'chat.completion.chunk',
      created: 1770764844,
      model: 'qwen-plus',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop',
        },
      ],
    });

    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${contentChunk}\n\n`,
        `data: ${usageChunk}\n\n`,
        'data: [DONE]\n\n',
      ],
    };

    const result = await model.doStream({ prompt: TEST_PROMPT });
    const parts = await convertReadableStreamToArray(result.stream);
    const finishPart = parts.find(p => p.type === 'finish');

    expect(finishPart).toMatchObject({
      type: 'finish',
      finishReason: 'stop',
      providerMetadata: { alibaba: { cacheCreationInputTokens: 20 } },
    });
  });
});
