import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGoogle } from './google-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const GENERATE_CONTENT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Resolve tomorrow.' }] },
];

const server = createTestServer({
  [GENERATE_CONTENT_URL]: {
    response: {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          new URL('./__fixtures__/google-text.json', import.meta.url),
          'utf8',
        ),
      ),
    },
  },
});

describe('issue #10023', () => {
  it('does not combine application/json response mode with function tools', async () => {
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
      "Function calling with a response mime type: 'application/json' is unsupported",
    );

    const model = createGoogle({ apiKey: 'test-api-key' })(
      'gemini-2.5-flash-lite',
    );

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
          functionDeclarations: expect.arrayContaining([
            expect.objectContaining({ name: 'resolveDate' }),
          ]),
        }),
      ]),
    );
    expect(requestBody.generationConfig.responseMimeType).toBeUndefined();
  });
});
