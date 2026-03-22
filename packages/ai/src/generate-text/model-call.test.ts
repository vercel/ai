import {
  APICallError,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { modelCall } from './model-call';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

const basePrompt = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hi' }] },
];

describe('modelCall', () => {
  it('returns stream, request, and response synchronously', () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([]),
        request: { body: 'test' },
        response: { headers: { 'x-request-id': 'abc' } },
      }),
    });

    const result = modelCall({
      model,
      prompt: basePrompt,
      userTools: undefined,
      system: undefined,
      messages: [],
      repairToolCall: undefined,
    });

    expect(result.stream).toBeDefined();
    expect(result.request).toBeInstanceOf(Promise);
    expect(result.response).toBeInstanceOf(Promise);
  });

  it('produces transformed stream chunks', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'Hello' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ]),
      }),
    });

    const { stream } = modelCall({
      model,
      prompt: basePrompt,
      userTools: undefined,
      system: undefined,
      messages: [],
      repairToolCall: undefined,
    });

    const chunks = await convertReadableStreamToArray(stream);
    expect(chunks).toHaveLength(5);
    expect(chunks[0].type).toBe('stream-start');
    expect(chunks[1].type).toBe('text-start');
    expect(chunks[2].type).toBe('text-delta');
    expect(chunks[2]).toMatchObject({ text: 'Hello' });
    expect(chunks[3].type).toBe('text-end');
    expect(chunks[4].type).toBe('finish');
  });

  it('resolves request and response with doStream return values', async () => {
    const requestBody = { model: 'gpt-4' };
    const responseHeaders = { 'x-request-id': 'req-123' };

    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ]),
        request: { body: requestBody },
        response: { headers: responseHeaders },
      }),
    });

    const { stream, request, response } = modelCall({
      model,
      prompt: basePrompt,
      userTools: undefined,
      system: undefined,
      messages: [],
      repairToolCall: undefined,
    });

    await convertReadableStreamToArray(stream);

    const resolvedRequest = await request;
    const resolvedResponse = await response;

    expect(resolvedRequest).toEqual({ body: requestBody });
    expect(resolvedResponse).toEqual({ headers: responseHeaders });
  });

  it('wraps doStream with retry on failure', async () => {
    let callCount = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        callCount++;
        if (callCount < 2) {
          throw new APICallError({
            message: 'Temporary failure',
            url: '',
            requestBodyValues: undefined,
            isRetryable: true,
          });
        }
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
            },
          ]),
        };
      },
    });

    const { stream } = modelCall({
      model,
      prompt: basePrompt,
      maxRetries: 2,
      userTools: undefined,
      system: undefined,
      messages: [],
      repairToolCall: undefined,
    });

    const chunks = await convertReadableStreamToArray(stream);
    expect(chunks).toHaveLength(2);
    expect(callCount).toBe(2);
  });
});
