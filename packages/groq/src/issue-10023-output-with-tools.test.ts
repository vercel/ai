import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGroq } from './groq-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Resolve tomorrow.' }] },
];

const server = createTestServer({
  [CHAT_COMPLETIONS_URL]: {
    response: {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          new URL('./__fixtures__/groq-text.json', import.meta.url),
          'utf8',
        ),
      ),
    },
  },
});

describe('issue #10023', () => {
  it('does not combine native JSON mode with function tools', async () => {
    const liveError = JSON.parse(
      fs.readFileSync(
        new URL(
          './__fixtures__/issue-10023-output-with-tools-error.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(liveError.error.message).toBe(
      'json mode cannot be combined with tool/function calling',
    );

    const model = createGroq({ apiKey: 'test-api-key' })('openai/gpt-oss-120b');

    await model.doGenerate({
      prompt,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { date: { type: 'string' } },
          required: ['date'],
          additionalProperties: false,
        },
      },
      tools: [
        {
          type: 'function',
          name: 'resolveDate',
          description: 'Resolve a relative date.',
          inputSchema: {
            type: 'object',
            properties: { expression: { type: 'string' } },
            required: ['expression'],
            additionalProperties: false,
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: 'resolveDate' }),
        }),
      ]),
    );
    expect(requestBody.response_format).toBeUndefined();
  });
});
