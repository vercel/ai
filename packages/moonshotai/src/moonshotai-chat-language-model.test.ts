import { LanguageModelV2Prompt } from '@ai-sdk/provider';
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
  describe('doStream', () => {
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
