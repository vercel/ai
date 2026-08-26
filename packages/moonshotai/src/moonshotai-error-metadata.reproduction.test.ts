import { APICallError, type LanguageModelV2Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const prompt: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

function readFixture(filename: string) {
  return fs.readFileSync(`src/__fixtures__/${filename}`, 'utf8').trim();
}

function createFixtureProvider({
  body,
  status,
  contentType,
}: {
  body: string;
  status: number;
  contentType: string;
}) {
  return createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(body, {
        status,
        headers: { 'content-type': contentType },
      }),
  });
}

async function captureHttpError(filename: string) {
  const body = readFixture(filename);
  const expected = JSON.parse(body);
  const provider = createFixtureProvider({
    body,
    status: 400,
    contentType: 'application/json',
  });

  try {
    await provider.chatModel('kimi-k3').doGenerate({ prompt });
    expect.fail('Expected an APICallError');
  } catch (error) {
    expect(APICallError.isInstance(error)).toBe(true);
    if (!APICallError.isInstance(error)) {
      throw error;
    }
    return { error, expected };
  }

  throw new Error('Expected Moonshot HTTP request to fail');
}

describe('issue #19552: Moonshot API error metadata', () => {
  it('preserves message, type, and code in HTTP APICallError.data', async () => {
    const { error, expected } = await captureHttpError(
      'moonshotai-error-with-code.json',
    );

    expect(error.message).toBe(expected.error.message);
    expect(error.data).toStrictEqual(expected);
  });

  it('preserves message, type, and code in SSE error parts', async () => {
    const chunk = readFixture('moonshotai-error-with-code.chunks.txt');
    const expected = JSON.parse(chunk);
    const provider = createFixtureProvider({
      body: `data: ${chunk}\n\ndata: [DONE]\n\n`,
      status: 200,
      contentType: 'text/event-stream',
    });

    const result = await provider.chatModel('kimi-k3').doStream({ prompt });
    const parts = await convertReadableStreamToArray(result.stream);
    const errorPart = parts.find(part => part.type === 'error');

    expect(errorPart?.type).toBe('error');
    if (errorPart?.type !== 'error') {
      return;
    }
    expect(errorPart.error).toStrictEqual(expected.error);
  });

  it.each([
    ['nullable code', 'moonshotai-error-with-null-code.json'],
    ['message-only', 'moonshotai-error-message-only.json'],
    ['live response without code', 'moonshotai-error-without-code-live.json'],
  ])('continues to parse %s HTTP errors', async (_name, filename) => {
    const { error, expected } = await captureHttpError(filename);

    expect(error.message).toBe(expected.error.message);
    expect(error.data).toStrictEqual(expected);
  });
});
