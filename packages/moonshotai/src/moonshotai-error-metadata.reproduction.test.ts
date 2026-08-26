import { APICallError, type LanguageModelV3Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function readJsonFixture(filename: string): unknown {
  return JSON.parse(
    fs.readFileSync(new URL(`./__fixtures__/${filename}`, import.meta.url), {
      encoding: 'utf8',
    }),
  );
}

function readSseFixture(filename: string): string {
  return fs
    .readFileSync(new URL(`./__fixtures__/${filename}`, import.meta.url), {
      encoding: 'utf8',
    })
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => `data: ${line}\n\n`)
    .concat('data: [DONE]\n\n')
    .join('');
}

async function getHttpError(errorResponse: unknown) {
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
  });

  try {
    await provider.chatModel('kimi-k3').doGenerate({ prompt });
  } catch (error) {
    expect(APICallError.isInstance(error)).toBe(true);
    return error as APICallError;
  }

  throw new Error('Expected the Moonshot HTTP request to fail.');
}

describe('Moonshot error metadata reproduction', () => {
  it.each([
    [
      'coded error',
      readJsonFixture('moonshotai-error-with-code.json'),
      'Coded HTTP error',
    ],
    [
      'nullable code',
      {
        error: {
          message: 'Nullable code HTTP error',
          type: 'invalid_request_error',
          code: null,
        },
      },
      'Nullable code HTTP error',
    ],
    [
      'message-only live error',
      readJsonFixture('moonshotai-error-live-message-only.json'),
      'Not found the model issue-19552-invalid-model or Permission denied',
    ],
  ])('preserves HTTP %s data', async (_name, response, expectedMessage) => {
    const error = await getHttpError(response);

    expect(error.message).toBe(expectedMessage);
    expect(error.data).toStrictEqual(response);
  });

  it('preserves structured diagnostics in SSE error parts', async () => {
    const provider = createMoonshotAI({
      apiKey: 'test-api-key',
      fetch: async () =>
        new Response(readSseFixture('moonshotai-error-metadata.chunks.txt'), {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    });

    const result = await provider.chatModel('kimi-k3').doStream({ prompt });
    const parts = await convertReadableStreamToArray(result.stream);

    expect(parts.filter(part => part.type === 'error')).toStrictEqual([
      {
        type: 'error',
        error: {
          message: 'Coded stream failure',
          type: 'server_error',
          code: 'stream_code',
        },
      },
      {
        type: 'error',
        error: {
          message: 'Nullable code stream failure',
          type: 'server_error',
          code: null,
        },
      },
      {
        type: 'error',
        error: {
          message: 'Message-only stream failure',
        },
      },
    ]);
  });
});
