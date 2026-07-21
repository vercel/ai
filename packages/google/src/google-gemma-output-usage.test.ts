import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';

const modelId = 'gemma-4-26b-a4b-it';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`;

const prompt: LanguageModelV2Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Reply with exactly: hello' }],
  },
];

const server = createTestServer({ [url]: {} });

describe('Gemma streaming output usage', () => {
  it('maps the live Gemma output token count', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: fs
        .readFileSync(
          'src/__fixtures__/gemma-4-output-usage.chunks.txt',
          'utf8',
        )
        .trim()
        .split('\n')
        .map(chunk => `data: ${chunk}\n\n`),
    };

    const provider = createGoogleGenerativeAI({ apiKey: 'test-api-key' });
    const result = await provider(modelId).doStream({ prompt });
    const parts = await convertReadableStreamToArray(result.stream);
    const text = parts
      .filter(part => part.type === 'text-delta')
      .map(part => part.delta)
      .join('');
    const finish = parts.find(part => part.type === 'finish');

    expect(text).toBe('hello');
    expect(finish).toMatchObject({
      type: 'finish',
      usage: {
        inputTokens: 6,
        outputTokens: 1,
        totalTokens: 83,
        reasoningTokens: 76,
      },
    });
  });
});
