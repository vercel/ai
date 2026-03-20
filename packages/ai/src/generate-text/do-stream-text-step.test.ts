import {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { doStreamTextStep } from './do-stream-text-step';

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

describe('doStreamTextStep', () => {
  it('should stream text and produce start-step/finish-step markers', async () => {
    const result = await doStreamTextStep({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-delta', id: '1', delta: ' World' },
            { type: 'text-end', id: '1' },
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
      callId: 'test-call-id',
      stepNumber: 0,
    });

    const chunks = await convertReadableStreamToArray(result.stream);
    const types = chunks.map(c => c.type);

    expect(types).toEqual([
      'start-step',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish-step',
    ]);

    // Check text deltas
    const textDeltas = chunks.filter(c => c.type === 'text-delta');
    expect(textDeltas[0]).toMatchObject({ text: 'Hello' });
    expect(textDeltas[1]).toMatchObject({ text: ' World' });

    // Check finish-step
    const finishStep = chunks.find(c => c.type === 'finish-step');
    expect(finishStep).toMatchObject({
      type: 'finish-step',
      finishReason: 'stop',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
      },
    });
  });

  it('should resolve stepResult promise with accumulated content', async () => {
    const result = await doStreamTextStep({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-delta', id: '1', delta: ' World' },
            { type: 'text-end', id: '1' },
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
      callId: 'test-call-id',
      stepNumber: 0,
    });

    // Consume the stream to trigger stepResult resolution
    await convertReadableStreamToArray(result.stream);

    const stepResult = await result.stepResult;
    expect(stepResult.text).toBe('Hello World');
    expect(stepResult.finishReason).toBe('stop');
    expect(stepResult.usage.inputTokens).toBe(10);
    expect(stepResult.usage.outputTokens).toBe(5);
    expect(stepResult.callId).toBe('test-call-id');
    expect(stepResult.stepNumber).toBe(0);
  });

  it('should resolve toolCalls promise with tool call parts', async () => {
    const result = await doStreamTextStep({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'tc-1',
              toolName: 'myTool',
              input: '{"value":"test"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_use' },
              usage: testUsage,
            },
          ]),
        }),
      }),
      callSettings: {},
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
      callId: 'test-call-id',
      stepNumber: 0,
    });

    // Consume the stream
    await convertReadableStreamToArray(result.stream);

    const toolCalls = await result.toolCalls;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      toolCallId: 'tc-1',
      toolName: 'myTool',
    });
  });

  it('should handle reasoning deltas', async () => {
    const result = await doStreamTextStep({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'reasoning-start', id: 'r1' },
            { type: 'reasoning-delta', id: 'r1', delta: 'thinking...' },
            { type: 'reasoning-end', id: 'r1' },
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'result' },
            { type: 'text-end', id: '1' },
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
      callId: 'test-call-id',
      stepNumber: 0,
    });

    const chunks = await convertReadableStreamToArray(result.stream);
    const types = chunks.map(c => c.type);

    expect(types).toContain('reasoning-start');
    expect(types).toContain('reasoning-delta');
    expect(types).toContain('reasoning-end');

    const stepResult = await result.stepResult;
    expect(stepResult.reasoningText).toBe('thinking...');
    expect(stepResult.text).toBe('result');
  });

  it('should handle response metadata', async () => {
    const result = await doStreamTextStep({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'response-metadata',
              id: 'resp-1',
              modelId: 'test-model',
              timestamp: new Date(1000),
            },
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
      }),
      callSettings: {},
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      messages: [{ role: 'user', content: 'hello' }],
      callId: 'test-call-id',
      stepNumber: 0,
    });

    await convertReadableStreamToArray(result.stream);
    const stepResult = await result.stepResult;

    expect(stepResult.response.id).toBe('resp-1');
    expect(stepResult.response.modelId).toBe('test-model');
    expect(stepResult.response.timestamp).toEqual(new Date(1000));
  });

  it('should filter empty text deltas', async () => {
    const result = await doStreamTextStep({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: '' },
            { type: 'text-delta', id: '1', delta: 'Hello' },
            { type: 'text-end', id: '1' },
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
      callId: 'test-call-id',
      stepNumber: 0,
    });

    const chunks = await convertReadableStreamToArray(result.stream);
    const textDeltas = chunks.filter(c => c.type === 'text-delta');
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0]).toMatchObject({ text: 'Hello' });
  });

  it('should handle sources', async () => {
    const result = await doStreamTextStep({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'answer' },
            { type: 'text-end', id: '1' },
            {
              type: 'source',
              sourceType: 'url',
              id: 'src-1',
              url: 'https://example.com',
              title: 'Example',
            },
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
      callId: 'test-call-id',
      stepNumber: 0,
    });

    await convertReadableStreamToArray(result.stream);
    const stepResult = await result.stepResult;
    expect(stepResult.sources).toHaveLength(1);
    expect(stepResult.sources[0]).toMatchObject({
      sourceType: 'url',
      url: 'https://example.com',
    });
  });
});
