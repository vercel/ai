import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createMoonshotAI({
  apiKey: 'test-api-key',
});

const server = createTestServer({
  'https://api.moonshot.ai/v1/chat/completions': {},
});

function prepareJsonResponse() {
  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'json-value',
    body: {
      id: 'chatcmpl-sampling',
      object: 'chat.completion',
      created: 1785880000,
      model: 'kimi-k3',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    },
  };
}

function prepareChunksFixtureResponse(filename: string) {
  const chunks = fs
    .readFileSync(`src/__fixtures__/${filename}.chunks.txt`, 'utf8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => `data: ${line}\n\n`);
  chunks.push('data: [DONE]\n\n');

  server.urls['https://api.moonshot.ai/v1/chat/completions'].response = {
    type: 'stream-chunks',
    chunks,
  };
}

describe('MoonshotAIChatLanguageModel', () => {
  describe('doGenerate', () => {
    beforeEach(() => {
      prepareJsonResponse();
    });

    it.each([
      'kimi-k2.5',
      'kimi-k2.6',
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
      'kimi-k3',
    ] as const)(
      'should omit fixed sampling options and warn for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          temperature: 0.2,
          topP: 0.4,
          frequencyPenalty: 0.5,
          presencePenalty: 0.6,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
          model: modelId,
          messages: [{ role: 'user', content: 'Hello' }],
        });
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported-setting',
            setting: 'temperature',
            details: `temperature is fixed by model "${modelId}" and has been omitted.`,
          },
          {
            type: 'unsupported-setting',
            setting: 'topP',
            details: `topP is fixed by model "${modelId}" and has been omitted.`,
          },
          {
            type: 'unsupported-setting',
            setting: 'frequencyPenalty',
            details: `frequencyPenalty is fixed by model "${modelId}" and has been omitted.`,
          },
          {
            type: 'unsupported-setting',
            setting: 'presencePenalty',
            details: `presencePenalty is fixed by model "${modelId}" and has been omitted.`,
          },
        ]);
      },
    );

    it.each(['moonshot-v1-8k', 'custom-model'] as const)(
      'should preserve sampling options for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          temperature: 0.2,
          topP: 0.4,
          frequencyPenalty: 0.5,
          presencePenalty: 0.6,
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          model: modelId,
          temperature: 0.2,
          top_p: 0.4,
          frequency_penalty: 0.5,
          presence_penalty: 0.6,
        });
        expect(result.warnings).toStrictEqual([]);
      },
    );

    it.each([
      'kimi-k2.6',
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
    ] as const)(
      'should omit required tool choice and warn for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the weather',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
          toolChoice: { type: 'required' },
        });

        expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
          'tool_choice',
        );
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported-setting',
            setting: 'toolChoice',
            details: `toolChoice "required" is not supported by model "${modelId}" and has been omitted; use "auto" or select a specific tool instead.`,
          },
        ]);
      },
    );

    it.each(['kimi-k3', 'custom-model'] as const)(
      'should preserve required tool choice for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Get the weather',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
          toolChoice: { type: 'required' },
        });

        expect((await server.calls[0].requestBodyJson).tool_choice).toBe(
          'required',
        );
        expect(result.warnings).toStrictEqual([]);
      },
    );

    it('should preserve non-required tool choices for unsupported models', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the weather',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'auto' },
      });

      expect((await server.calls[0].requestBodyJson).tool_choice).toBe('auto');
      expect(result.warnings).toStrictEqual([]);
    });

    it('should omit unsupported budget tokens and warn', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            thinking: { type: 'enabled', budgetTokens: 2048 },
          },
        },
      });

      expect((await server.calls[0].requestBodyJson).thinking).toStrictEqual({
        type: 'enabled',
      });
      expect(result.warnings).toStrictEqual([
        {
          type: 'other',
          message:
            'providerOptions.moonshotai.thinking.budgetTokens is deprecated because Moonshot Chat Completions does not support budget_tokens. The option has been omitted.',
        },
      ]);
    });

    it('should map K2.6 preserved reasoning to thinking.keep', async () => {
      await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            thinking: { type: 'enabled' },
            reasoningHistory: 'preserved',
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody.thinking).toStrictEqual({
        type: 'enabled',
        keep: 'all',
      });
      expect(requestBody).not.toHaveProperty('reasoningHistory');
      expect(requestBody).not.toHaveProperty('reasoning_history');
    });

    it('should not send other reasoning history modes', async () => {
      await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningHistory: 'interleaved' },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('reasoningHistory');
      expect(requestBody).not.toHaveProperty('reasoning_history');
      expect(requestBody).not.toHaveProperty('thinking');
    });

    it('should pass K3 reasoning effort through', async () => {
      await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningEffort: 'low' },
        },
      });

      expect((await server.calls[0].requestBodyJson).reasoning_effort).toBe(
        'low',
      );
    });

    it('should omit thinking for Kimi K3', async () => {
      const result = await provider.chatModel('kimi-k3').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            thinking: { type: 'disabled' },
            reasoningHistory: 'preserved',
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'thinking',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'Kimi K3 always reasons and does not accept providerOptions.moonshotai.thinking. The option has been omitted.',
        },
      ]);
    });

    it.each(['kimi-k2.7-code', 'kimi-k2.7-code-highspeed'] as const)(
      'should not disable thinking for %s',
      async modelId => {
        const result = await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            moonshotai: { thinking: { type: 'disabled' } },
          },
        });

        expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
          'thinking',
        );
        expect(result.warnings).toStrictEqual([
          {
            type: 'unsupported-setting',
            setting: 'providerOptions',
            details:
              'Kimi K2.7 thinking cannot be disabled. providerOptions.moonshotai.thinking has been omitted.',
          },
        ]);
      },
    );

    it('should rely on K2.7 preserved-thinking defaults', async () => {
      const result = await provider.chatModel('kimi-k2.7-code').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningHistory: 'preserved' },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'thinking',
      );
      expect(result.warnings).toStrictEqual([]);
    });

    it('should omit reasoning effort for K2 models and warn', async () => {
      const result = await provider.chatModel('kimi-k2.6').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningEffort: 'high' },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'reasoning_effort',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.reasoningEffort is only supported by Kimi K3 and has been omitted for model "kimi-k2.6".',
        },
      ]);
    });

    it('should omit thinking and reasoning options for Moonshot V1', async () => {
      const result = await provider.chatModel('moonshot-v1-8k').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: {
            reasoningEffort: 'high',
            thinking: { type: 'enabled' },
            reasoningHistory: 'preserved',
          },
        },
      });

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('reasoning_effort');
      expect(requestBody).not.toHaveProperty('thinking');
      expect(requestBody).not.toHaveProperty('reasoningHistory');
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.reasoningEffort is only supported by Kimi K3 and has been omitted for model "moonshot-v1-8k".',
        },
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.thinking is not supported by model "moonshot-v1-8k" and has been omitted.',
        },
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.reasoningHistory \'preserved\' is not supported by model "moonshot-v1-8k" and has been omitted.',
        },
      ]);
    });

    it('should omit preserved reasoning for K2.5 and warn', async () => {
      const result = await provider.chatModel('kimi-k2.5').doGenerate({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { reasoningHistory: 'preserved' },
        },
      });

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'thinking',
      );
      expect(result.warnings).toStrictEqual([
        {
          type: 'unsupported-setting',
          setting: 'providerOptions',
          details:
            'providerOptions.moonshotai.reasoningHistory \'preserved\' is not supported by model "kimi-k2.5" and has been omitted.',
        },
      ]);
    });

    describe('structured outputs', () => {
      it('should normalize schemas and enable strict validation by default', async () => {
        await provider.chatModel('kimi-k3').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            name: 'named_pair',
            schema: {
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'object',
              properties: {
                pair: {
                  type: 'array',
                  items: [{ type: 'string' }, { type: 'number' }],
                },
              },
            },
          },
        });

        expect(
          (await server.calls[0].requestBodyJson).response_format,
        ).toStrictEqual({
          type: 'json_schema',
          json_schema: {
            name: 'named_pair',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                pair: {
                  type: 'array',
                  prefixItems: [{ type: 'string' }, { type: 'number' }],
                },
              },
            },
          },
        });
      });

      it('should allow strict validation to be disabled without leaking the provider option', async () => {
        await provider.chatModel('kimi-k3').doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            moonshotai: { strictJsonSchema: false },
          },
          responseFormat: {
            type: 'json',
            schema: { type: 'object', properties: {} },
          },
        });

        const requestBody = await server.calls[0].requestBodyJson;
        expect(requestBody).not.toHaveProperty('strictJsonSchema');
        expect(requestBody.response_format.json_schema.strict).toBe(false);
      });

      it('should fall back to json_object without a schema', async () => {
        await provider.chatModel('kimi-k3').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: { type: 'json' },
        });

        expect(
          (await server.calls[0].requestBodyJson).response_format,
        ).toStrictEqual({ type: 'json_object' });
      });

      it.each([
        'moonshot-v1-8k',
        'moonshot-v1-32k',
        'moonshot-v1-128k',
        'moonshot-v1-auto',
        'moonshot-v1-8k-vision-preview',
        'moonshot-v1-32k-vision-preview',
        'moonshot-v1-128k-vision-preview',
      ])('should use json_schema for %s', async modelId => {
        await provider.chatModel(modelId).doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            name: 'response',
            schema: { type: 'object', properties: {} },
          },
        });

        expect(
          (await server.calls[0].requestBodyJson).response_format,
        ).toStrictEqual({
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: { type: 'object', properties: {} },
          },
        });
      });

      it('should fall back to json_object for unknown models', async () => {
        await provider.chatModel('custom-model').doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: 'json',
            schema: { type: 'object', properties: {} },
          },
        });

        expect(
          (await server.calls[0].requestBodyJson).response_format,
        ).toStrictEqual({ type: 'json_object' });
      });
    });
  });

  describe('doStream', () => {
    it('should omit sampling options and add v2 warnings when streaming', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      const result = await provider.chatModel('kimi-k3').doStream({
        prompt: TEST_PROMPT,
        temperature: 0.2,
        topP: 0.4,
      });
      const parts = await convertReadableStreamToArray(result.stream);

      const requestBody = await server.calls[0].requestBodyJson;
      expect(requestBody).not.toHaveProperty('temperature');
      expect(requestBody).not.toHaveProperty('top_p');
      expect(parts[0]).toStrictEqual({
        type: 'stream-start',
        warnings: [
          {
            type: 'unsupported-setting',
            setting: 'temperature',
            details:
              'temperature is fixed by model "kimi-k3" and has been omitted.',
          },
          {
            type: 'unsupported-setting',
            setting: 'topP',
            details: 'topP is fixed by model "kimi-k3" and has been omitted.',
          },
        ],
      });
    });

    it('should sanitize thinking options and add v2 warnings when streaming', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      const result = await provider.chatModel('kimi-k2.7-code').doStream({
        prompt: TEST_PROMPT,
        providerOptions: {
          moonshotai: { thinking: { type: 'disabled' } },
        },
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'thinking',
      );
      expect(parts[0]).toStrictEqual({
        type: 'stream-start',
        warnings: [
          {
            type: 'unsupported-setting',
            setting: 'providerOptions',
            details:
              'Kimi K2.7 thinking cannot be disabled. providerOptions.moonshotai.thinking has been omitted.',
          },
        ],
      });
    });

    it('should omit required tool choice and add a v2 warning when streaming', async () => {
      prepareChunksFixtureResponse('moonshot-text');

      const result = await provider.chatModel('kimi-k2.6').doStream({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the weather',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'required' },
      });
      const parts = await convertReadableStreamToArray(result.stream);

      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'tool_choice',
      );
      expect(parts[0]).toStrictEqual({
        type: 'stream-start',
        warnings: [
          {
            type: 'unsupported-setting',
            setting: 'toolChoice',
            details:
              'toolChoice "required" is not supported by model "kimi-k2.6" and has been omitted; use "auto" or select a specific tool instead.',
          },
        ],
      });
    });

    describe('cached tokens at top level (MoonshotAI format)', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('moonshot-cached-tokens');
      });

      it('should extract cachedInputTokens from top-level cached_tokens', async () => {
        const result = await provider.chatModel('kimi-k2.5').doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(result.stream);
        const finishPart = parts.find(part => part.type === 'finish');

        expect(finishPart).toBeDefined();
        expect(finishPart!.type).toBe('finish');
        if (finishPart!.type === 'finish') {
          expect(finishPart!.usage).toEqual({
            inputTokens: 100,
            outputTokens: 10,
            totalTokens: 110,
            reasoningTokens: undefined,
            cachedInputTokens: 80,
          });
        }
      });

      it('should not emit raw chunks when not requested', async () => {
        const result = await provider.chatModel('kimi-k2.5').doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(result.stream);
        const rawParts = parts.filter(part => part.type === 'raw');

        expect(rawParts).toHaveLength(0);
      });

      it('should emit raw chunks when includeRawChunks is true', async () => {
        const result = await provider.chatModel('kimi-k2.5').doStream({
          prompt: TEST_PROMPT,
          includeRawChunks: true,
        });

        const parts = await convertReadableStreamToArray(result.stream);
        const rawParts = parts.filter(part => part.type === 'raw');

        expect(rawParts.length).toBeGreaterThan(0);
      });
    });

    describe('without cached tokens', () => {
      beforeEach(() => {
        prepareChunksFixtureResponse('moonshot-text');
      });

      it('should handle usage without cached_tokens', async () => {
        const result = await provider.chatModel('kimi-k2.5').doStream({
          prompt: TEST_PROMPT,
        });

        const parts = await convertReadableStreamToArray(result.stream);
        const finishPart = parts.find(part => part.type === 'finish');

        expect(finishPart).toBeDefined();
        expect(finishPart!.type).toBe('finish');
        if (finishPart!.type === 'finish') {
          expect(finishPart!.usage).toEqual({
            inputTokens: 50,
            outputTokens: 5,
            totalTokens: 55,
            reasoningTokens: undefined,
            cachedInputTokens: undefined,
          });
        }
      });
    });
  });
});
