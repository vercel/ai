import { APICallError, type LanguageModelV4Prompt } from '@ai-sdk/provider';
import { isProviderStreamError } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const prompt: LanguageModelV4Prompt = [
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

describe('issue #19552: Moonshot API error metadata', () => {
  it('preserves message, type, and code in HTTP APICallError.data', async () => {
    const body = readFixture('moonshotai-error-with-code.json');
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
        return;
      }
      expect(error.message).toBe(expected.error.message);
      expect(error.data).toStrictEqual(expected);
    }
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
    expect(isProviderStreamError(errorPart.error)).toBe(true);
    if (!isProviderStreamError(errorPart.error)) {
      return;
    }
    expect(errorPart.error.message).toBe(expected.error.message);
    expect(errorPart.error.type).toBe(expected.error.type);
    expect(errorPart.error.code).toBe(expected.error.code);
    expect(errorPart.error.data).toStrictEqual(expected);
  });

  it.each([
    ['nullable code', 'moonshotai-error-with-null-code.json'],
    ['message-only', 'moonshotai-error-message-only.json'],
  ])('continues to parse %s HTTP errors', async (_name, filename) => {
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
        return;
      }
      expect(error.message).toBe(expected.error.message);
      expect(error.data).toStrictEqual(expected);
    }
  });
});
