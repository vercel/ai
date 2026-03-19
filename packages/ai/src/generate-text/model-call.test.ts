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
  it('should stream text deltas', async () => {
    const result = await modelCall({
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
    const result = await modelCall({
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
    const result = await modelCall({
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

  it('should resolve request with metadata', async () => {
    const result = await modelCall({
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

    expect(result.request).toEqual({ body: { model: 'test' } });
  });

  it('should resolve response with headers', async () => {
    const result = await modelCall({
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

    expect(result.response?.headers).toEqual({ 'x-request-id': '123' });
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

    const result = await modelCall({
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

  it('should throw when doStream fails', async () => {
    await expect(
      modelCall({
        model: new MockLanguageModelV4({
          doStream: async () => {
            throw new Error('model error');
          },
        }),
        callSettings: {},
        maxRetries: 0,
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toThrow('model error');
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

    const result = await modelCall({
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
