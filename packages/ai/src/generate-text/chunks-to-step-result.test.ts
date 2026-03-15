import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  chunksToStepResult,
  normalizeFinishReason,
} from './chunks-to-step-result';

describe('normalizeFinishReason', () => {
  it('should extract "stop" from V3 finish reason', () => {
    expect(normalizeFinishReason({ unified: 'stop', raw: 'stop' })).toBe(
      'stop',
    );
  });

  it('should extract "tool-calls" from V3 finish reason', () => {
    expect(
      normalizeFinishReason({ unified: 'tool-calls', raw: 'tool_use' }),
    ).toBe('tool-calls');
  });

  it('should extract "length" from V3 finish reason', () => {
    expect(normalizeFinishReason({ unified: 'length', raw: 'length' })).toBe(
      'length',
    );
  });

  it('should extract "content-filter" from V3 finish reason', () => {
    expect(
      normalizeFinishReason({
        unified: 'content-filter',
        raw: 'content_filter',
      }),
    ).toBe('content-filter');
  });

  it('should extract "error" from V3 finish reason', () => {
    expect(normalizeFinishReason({ unified: 'error', raw: 'error' })).toBe(
      'error',
    );
  });

  it('should extract "other" from V3 finish reason', () => {
    expect(normalizeFinishReason({ unified: 'other', raw: undefined })).toBe(
      'other',
    );
  });

  it('should return "other" for undefined', () => {
    expect(normalizeFinishReason(undefined)).toBe('other');
  });
});

describe('chunksToStepResult', () => {
  const idCounter = { value: 0 };
  const generateId = () => `test-id-${idCounter.value++}`;

  beforeEach(() => {
    idCounter.value = 0;
  });

  it('should aggregate text deltas', () => {
    const chunks: LanguageModelV3StreamPart[] = [
      { type: 'text-delta', id: 't1', delta: 'Hello ' },
      { type: 'text-delta', id: 't1', delta: 'world' },
    ];

    const result = chunksToStepResult({
      chunks,
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.text).toBe('Hello world');
    expect(result.content[0]).toEqual({ type: 'text', text: 'Hello world' });
  });

  it('should aggregate reasoning deltas', () => {
    const chunks: LanguageModelV3StreamPart[] = [
      { type: 'reasoning-delta', id: 'r1', delta: 'Think ' },
      { type: 'reasoning-delta', id: 'r1', delta: 'carefully' },
    ];

    const result = chunksToStepResult({
      chunks,
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.reasoningText).toBe('Think carefully');
    expect(result.reasoning).toHaveLength(2);
    expect(result.reasoning[0].text).toBe('Think ');
    expect(result.reasoning[1].text).toBe('carefully');
  });

  it('should include tool calls in content', () => {
    const toolCalls = [
      {
        type: 'tool-call' as const,
        toolCallId: 'tc1',
        toolName: 'search',
        input: '{"query":"test"}',
      },
    ];

    const result = chunksToStepResult({
      chunks: [],
      toolCalls,
      prompt: [],
      generateId,
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'tc1',
      toolName: 'search',
      input: { query: 'test' },
      dynamic: true,
    });
    expect(result.dynamicToolCalls).toHaveLength(1);
    expect(result.staticToolCalls).toHaveLength(0);
  });

  it('should handle file chunks with base64 data', () => {
    const chunks: LanguageModelV3StreamPart[] = [
      { type: 'file', mediaType: 'image/png', data: 'aGVsbG8=' },
    ];

    const result = chunksToStepResult({
      chunks,
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].mediaType).toBe('image/png');
    expect(result.files[0].base64).toBe('aGVsbG8=');
  });

  it('should handle file chunks with Uint8Array data', () => {
    const data = new Uint8Array([104, 101, 108, 108, 111]);
    const chunks: LanguageModelV3StreamPart[] = [
      { type: 'file', mediaType: 'image/png', data },
    ];

    const result = chunksToStepResult({
      chunks,
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].mediaType).toBe('image/png');
    expect(result.files[0].uint8Array).toEqual(data);
  });

  it('should extract source chunks', () => {
    const chunks: LanguageModelV3StreamPart[] = [
      {
        type: 'source',
        sourceType: 'url',
        id: 's1',
        url: 'https://example.com',
        title: 'Example',
      },
    ];

    const result = chunksToStepResult({
      chunks,
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      sourceType: 'url',
      url: 'https://example.com',
    });
  });

  it('should extract usage from finish part', () => {
    const finish = {
      type: 'finish' as const,
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: {
        inputTokens: { total: 100, noCache: 80, cacheRead: 20, cacheWrite: 0 },
        outputTokens: { total: 50, text: 40, reasoning: 10 },
      },
    };

    const result = chunksToStepResult({
      chunks: [],
      toolCalls: [],
      prompt: [],
      finish,
      generateId,
    });

    expect(result.usage).toEqual({
      inputTokens: 100,
      inputTokenDetails: {
        noCacheTokens: 80,
        cacheReadTokens: 20,
        cacheWriteTokens: 0,
      },
      outputTokens: 50,
      outputTokenDetails: {
        textTokens: 40,
        reasoningTokens: 10,
      },
      totalTokens: 150,
    });
  });

  it('should return zero usage when no finish part', () => {
    const result = chunksToStepResult({
      chunks: [],
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.usage.totalTokens).toBe(0);
  });

  it('should extract warnings from stream-start', () => {
    const chunks: LanguageModelV3StreamPart[] = [
      {
        type: 'stream-start',
        warnings: [
          {
            type: 'unsupported-setting',
            setting: 'temperature',
            details: 'not supported',
          },
        ],
      },
    ];

    const result = chunksToStepResult({
      chunks,
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toMatchObject({
      type: 'unsupported-setting',
      setting: 'temperature',
    });
  });

  it('should extract response metadata', () => {
    const chunks: LanguageModelV3StreamPart[] = [
      {
        type: 'response-metadata',
        id: 'resp-123',
        modelId: 'openai:gpt-4o',
        timestamp: new Date('2024-01-01'),
      },
    ];

    const result = chunksToStepResult({
      chunks,
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.response.id).toBe('resp-123');
    expect(result.response.modelId).toBe('openai:gpt-4o');
    expect(result.model.provider).toBe('openai');
    expect(result.model.modelId).toBe('openai:gpt-4o');
  });

  it('should return empty text when no text deltas', () => {
    const result = chunksToStepResult({
      chunks: [],
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.text).toBe('');
    expect(result.reasoningText).toBeUndefined();
  });

  it('should set stepNumber to 0', () => {
    const result = chunksToStepResult({
      chunks: [],
      toolCalls: [],
      prompt: [],
      generateId,
    });

    expect(result.stepNumber).toBe(0);
  });

  it('should extract finish reason and raw finish reason', () => {
    const finish = {
      type: 'finish' as const,
      finishReason: { unified: 'tool-calls' as const, raw: 'tool_use' },
      usage: {
        inputTokens: {
          total: 0,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 0, text: undefined, reasoning: undefined },
      },
    };

    const result = chunksToStepResult({
      chunks: [],
      toolCalls: [],
      prompt: [],
      finish,
      generateId,
    });

    expect(result.finishReason).toBe('tool-calls');
    expect(result.rawFinishReason).toBe('tool_use');
  });

  it('should extract provider metadata from finish', () => {
    const finish = {
      type: 'finish' as const,
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: {
        inputTokens: {
          total: 0,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 0, text: undefined, reasoning: undefined },
      },
      providerMetadata: { openai: { systemFingerprint: 'fp_123' } },
    };

    const result = chunksToStepResult({
      chunks: [],
      toolCalls: [],
      prompt: [],
      finish,
      generateId,
    });

    expect(result.providerMetadata).toEqual({
      openai: { systemFingerprint: 'fp_123' },
    });
  });
});
