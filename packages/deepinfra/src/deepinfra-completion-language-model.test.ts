import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createDeepInfra } from './deepinfra-provider';

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];
const url = 'https://api.deepinfra.com/v1/openai/completions';
const server = createTestServer({ [url]: {} });

describe('DeepInfra completion stream errors', () => {
  it('should normalize the DeepInfra error_type/error_message frame', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          error_type: 'validation_error',
          error_message: JSON.stringify({ error: { message: 'Too long' } }),
        })}\n\n`,
      ],
    };

    const model = createDeepInfra({ apiKey: 'test-key' }).completionModel(
      'test-model',
    );
    const { stream } = await model.doStream({ prompt });
    const parts = await convertReadableStreamToArray(stream);

    expect(parts.find(part => part.type === 'error')).toEqual({
      type: 'error',
      error: {
        message: 'Too long',
        type: 'validation_error',
        param: undefined,
        code: 400,
      },
    });
  });
});
