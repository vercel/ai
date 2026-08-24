import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDeepSeek } from '../deepseek-provider';
import type { DeepSeekLanguageModelChatOptions } from './deepseek-chat-language-model-options';

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] },
];

const LEGACY_ADAPTIVE_OPTIONS = {
  thinking: { type: 'adaptive' },
} as unknown as DeepSeekLanguageModelChatOptions;

const server = createTestServer({
  'https://api.deepseek.com/chat/completions': {},
});

const provider = createDeepSeek({ apiKey: 'test-api-key' });

describe('issue #19381', () => {
  describe('doGenerate', () => {
    beforeEach(() => {
      server.urls['https://api.deepseek.com/chat/completions'].response = {
        type: 'json-value',
        body: JSON.parse(
          fs.readFileSync(
            'src/chat/__fixtures__/issue-19381-thinking-reasoning.json',
            'utf8',
          ),
        ),
      };
    });

    it('normalizes legacy adaptive thinking and generic medium reasoning', async () => {
      const result = await provider.chat('deepseek-v4-pro').doGenerate({
        prompt: TEST_PROMPT,
        reasoning: 'medium',
        providerOptions: {
          deepseek: LEGACY_ADAPTIVE_OPTIONS,
        },
      });
      const body = await server.calls[0].requestBodyJson;

      expect.soft(body.thinking?.type).not.toBe('adaptive');
      expect.soft(body.reasoning_effort).toBe('high');
    });
  });

  describe('doStream', () => {
    beforeEach(() => {
      const chunks = fs
        .readFileSync(
          'src/chat/__fixtures__/issue-19381-thinking-reasoning.chunks.txt',
          'utf8',
        )
        .trim()
        .split('\n')
        .map(line => `data: ${line}\n\n`);
      chunks.push('data: [DONE]\n\n');

      server.urls['https://api.deepseek.com/chat/completions'].response = {
        type: 'stream-chunks',
        chunks,
      };
    });

    it('normalizes legacy adaptive thinking and generic medium reasoning', async () => {
      const result = await provider.chat('deepseek-v4-pro').doStream({
        prompt: TEST_PROMPT,
        reasoning: 'medium',
        providerOptions: {
          deepseek: LEGACY_ADAPTIVE_OPTIONS,
        },
      });
      await convertReadableStreamToArray(result.stream);
      const body = await server.calls[0].requestBodyJson;

      expect.soft(body.thinking?.type).not.toBe('adaptive');
      expect.soft(body.reasoning_effort).toBe('high');
    });
  });
});
