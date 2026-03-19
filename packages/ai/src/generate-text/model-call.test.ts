import {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { modelCall } from './model-call';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    reasoning: undefined,
    text: 5,
  },
};

describe('modelCall', () => {
  it('should return synchronously', () => {
    const result = modelCall({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
            },
          ]),
        }),
      }),
      callSettings: {},
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    // Should return immediately without awaiting
    expect(result).toBeDefined();
    expect(result.stream).toBeInstanceOf(ReadableStream);
    expect(result.request).toBeInstanceOf(Promise);
    expect(result.response).toBeInstanceOf(Promise);
  });

  it('should stream text deltas', async () => {
    const result = modelCall({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-delta', id: '1', delta: ' World' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
            },
          ]),
        }),
      }),
      callSettings: {},
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    const chunks = await convertReadableStreamToArray(result.stream);
    const textDeltas = chunks.filter(c => c.type === 'text-delta');
    expect(textDeltas).toHaveLength(2);
    expect(textDeltas[0]).toMatchObject({ type: 'text-delta', text: 'Hello' });
    expect(textDeltas[1]).toMatchObject({ type: 'text-delta', text: ' World' });
  });

  it('should emit finish part with normalized usage', async () => {
    const result = modelCall({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'end_turn' },
              usage: testUsage,
            },
          ]),
        }),
      }),
      callSettings: {},
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    const chunks = await convertReadableStreamToArray(result.stream);
    const finishChunk = chunks.find(c => c.type === 'finish');
    expect(finishChunk).toMatchObject({
      type: 'finish',
      finishReason: 'stop',
      rawFinishReason: 'end_turn',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
      },
    });
  });

  it('should parse tool calls', async () => {
    const result = modelCall({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'myTool',
              input: '{"value":"test"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
              usage: testUsage,
            },
          ] as LanguageModelV4StreamPart[]),
        }),
      }),
      callSettings: {},
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    const chunks = await convertReadableStreamToArray(result.stream);
    const toolCallChunk = chunks.find(c => c.type === 'tool-call');
    expect(toolCallChunk).toMatchObject({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'myTool',
    });
  });

  it('should resolve request promise with metadata', async () => {
    const result = modelCall({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
            },
          ]),
          request: { body: { model: 'test' } },
        }),
      }),
      callSettings: {},
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    const request = await result.request;
    expect(request).toEqual({ body: { model: 'test' } });
  });

  it('should resolve response promise with headers', async () => {
    const result = modelCall({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
            },
          ]),
          response: { headers: { 'x-request-id': '123' } },
        }),
      }),
      callSettings: {},
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    const response = await result.response;
    expect(response?.headers).toEqual({ 'x-request-id': '123' });
  });

  it('should pass maxRetries to prepareRetries', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ]),
      }),
    });

    const result = modelCall({
      model,
      callSettings: {},
      maxRetries: 5,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    // Consume stream to complete the call
    await convertReadableStreamToArray(result.stream);

    // Verify the model was called (retry infrastructure is tested separately)
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it('should propagate errors on stream when doStream fails', async () => {
    const result = modelCall({
      model: new MockLanguageModelV4({
        doStream: async () => {
          throw new Error('model error');
        },
      }),
      callSettings: {},
      maxRetries: 0,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    // Prevent unhandled rejections from the promises
    result.request.catch(() => {});
    result.response.catch(() => {});

    const chunks = await convertReadableStreamToArray(result.stream);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
  });

  it('should reject request/response promises when doStream fails', async () => {
    const result = modelCall({
      model: new MockLanguageModelV4({
        doStream: async () => {
          throw new Error('model error');
        },
      }),
      callSettings: {},
      maxRetries: 0,
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    // Consume stream to prevent unhandled rejection from stream error
    convertReadableStreamToArray(result.stream).catch(() => {});

    await expect(result.request).rejects.toThrow('model error');
    await expect(result.response).rejects.toThrow('model error');
  });

  it('should pass call settings to doStream', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
          },
        ]),
      }),
    });

    const result = modelCall({
      model,
      callSettings: {
        maxOutputTokens: 100,
        temperature: 0.5,
      },
      tools: [
        { type: 'function', name: 'myTool', inputSchema: { type: 'object' } },
      ],
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
    });

    // consume stream to trigger doStream
    await convertReadableStreamToArray(result.stream);

    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0].maxOutputTokens).toBe(100);
    expect(model.doStreamCalls[0].temperature).toBe(0.5);
    expect(model.doStreamCalls[0].tools).toEqual([
      { type: 'function', name: 'myTool', inputSchema: { type: 'object' } },
    ]);
  });
});
