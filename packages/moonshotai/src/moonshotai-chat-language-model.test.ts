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
