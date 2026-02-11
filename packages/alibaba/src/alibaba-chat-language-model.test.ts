import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
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

const TEST_PROMPT: LanguageModelV3Prompt = [
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
          "inputTokens": {
            "cacheRead": 0,
            "cacheWrite": 0,
            "noCache": 24,
            "total": 24,
          },
          "outputTokens": {
            "reasoning": 1353,
            "text": 315,
            "total": 1668,
          },
          "raw": {
            "completion_tokens": 1668,
            "completion_tokens_details": {
              "reasoning_tokens": 1353,
            },
            "prompt_tokens": 24,
            "prompt_tokens_details": {
              "cached_tokens": 0,
            },
            "total_tokens": 1692,
          },
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

    const { usage } = await model.doGenerate({
      prompt: TEST_PROMPT,
    });

    expect(usage).toMatchInlineSnapshot(`
      {
        "inputTokens": {
          "cacheRead": 80,
          "cacheWrite": 20,
          "noCache": 0,
          "total": 100,
        },
        "outputTokens": {
          "reasoning": 10,
          "text": 40,
          "total": 50,
        },
        "raw": {
          "completion_tokens": 50,
          "completion_tokens_details": {
            "reasoning_tokens": 10,
          },
          "prompt_tokens": 100,
          "prompt_tokens_details": {
            "cache_creation_input_tokens": 20,
            "cached_tokens": 80,
          },
          "total_tokens": 150,
        },
      }
    `);
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
});
