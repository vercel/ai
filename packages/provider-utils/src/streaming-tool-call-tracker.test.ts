import { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { StreamingToolCallTracker } from './streaming-tool-call-tracker';

function createMockController() {
  const chunks: LanguageModelV3StreamPart[] = [];
  return {
    enqueue: (chunk: LanguageModelV3StreamPart) => chunks.push(chunk),
    chunks,
  } as unknown as TransformStreamDefaultController<LanguageModelV3StreamPart> & {
    chunks: LanguageModelV3StreamPart[];
  };
}

describe('StreamingToolCallTracker', () => {
  it('should handle a single-chunk tool call', () => {
    const tracker = new StreamingToolCallTracker({
      generateId: () => 'gen-id',
    });
    const controller = createMockController();

    tracker.handleDelta(
      {
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'search', arguments: '{"q":"test"}' },
      },
      controller,
    );

    tracker.flush(controller);

    expect(controller.chunks).toEqual([
      { type: 'tool-input-start', id: 'call_1', toolName: 'search' },
      {
        type: 'tool-input-delta',
        id: 'call_1',
        delta: '{"q":"test"}',
      },
      { type: 'tool-input-end', id: 'call_1' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'search',
        input: '{"q":"test"}',
      },
    ]);
  });

  it('should accumulate arguments across multiple deltas', () => {
    const tracker = new StreamingToolCallTracker({
      generateId: () => 'gen-id',
    });
    const controller = createMockController();

    tracker.handleDelta(
      {
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'search', arguments: '' },
      },
      controller,
    );

    tracker.handleDelta(
      { index: 0, function: { arguments: '{"q":' } },
      controller,
    );

    tracker.handleDelta(
      { index: 0, function: { arguments: ' "test"}' } },
      controller,
    );

    tracker.flush(controller);

    expect(controller.chunks).toEqual([
      { type: 'tool-input-start', id: 'call_1', toolName: 'search' },
      { type: 'tool-input-delta', id: 'call_1', delta: '{"q":' },
      { type: 'tool-input-delta', id: 'call_1', delta: ' "test"}' },
      { type: 'tool-input-end', id: 'call_1' },
      {
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'search',
        input: '{"q": "test"}',
      },
    ]);
  });

  it('should not finalize early when partial JSON is parsable', () => {
    const tracker = new StreamingToolCallTracker({
      generateId: () => 'gen-id',
    });
    const controller = createMockController();

    tracker.handleDelta(
      {
        index: 0,
        id: 'call_1',
        function: { name: 'search', arguments: '' },
      },
      controller,
    );

    // This produces valid JSON: {"query": "test"}
    tracker.handleDelta(
      { index: 0, function: { arguments: '{"query": "test"}' } },
      controller,
    );

    // But more data arrives
    tracker.handleDelta(
      { index: 0, function: { arguments: ', "limit": 10}' } },
      controller,
    );

    tracker.flush(controller);

    const toolCallEvent = controller.chunks.find(c => c.type === 'tool-call');
    expect(toolCallEvent).toEqual({
      type: 'tool-call',
      toolCallId: 'call_1',
      toolName: 'search',
      // Must contain ALL accumulated arguments
      input: '{"query": "test"}, "limit": 10}',
    });
  });

  it('should use generateId fallback when id is present', () => {
    const tracker = new StreamingToolCallTracker({
      generateId: () => 'fallback-id',
    });
    const controller = createMockController();

    tracker.handleDelta(
      {
        index: 0,
        id: 'call_1',
        function: { name: 'fn', arguments: '{}' },
      },
      controller,
    );
    tracker.flush(controller);

    const toolCall = controller.chunks.find(c => c.type === 'tool-call');
    expect((toolCall as any).toolCallId).toBe('call_1');
  });

  it('should validate type when validateType is true', () => {
    const tracker = new StreamingToolCallTracker();
    const controller = createMockController();

    expect(() =>
      tracker.handleDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'not_function',
          function: { name: 'fn', arguments: '' },
        },
        controller,
        { validateType: true },
      ),
    ).toThrow("Expected 'function' type.");
  });

  it('should not validate type when validateType is false', () => {
    const tracker = new StreamingToolCallTracker();
    const controller = createMockController();

    // Should not throw even with non-function type
    tracker.handleDelta(
      {
        index: 0,
        id: 'call_1',
        type: 'not_function',
        function: { name: 'fn', arguments: '' },
      },
      controller,
    );
  });

  it('should pass metadata through to flush', () => {
    const tracker = new StreamingToolCallTracker<string>({
      generateId: () => 'gen-id',
    });
    const controller = createMockController();

    tracker.handleDelta(
      {
        index: 0,
        id: 'call_1',
        function: { name: 'fn', arguments: '{}' },
        extra_content: { google: { thought_signature: 'sig123' } },
      },
      controller,
      {
        extractMetadata: delta =>
          (delta as any).extra_content?.google?.thought_signature,
      },
    );

    tracker.flush(controller, {
      buildToolCallProviderMetadata: sig =>
        sig ? { provider: { thoughtSignature: sig } } : undefined,
    });

    const toolCall = controller.chunks.find(c => c.type === 'tool-call');
    expect((toolCall as any).providerMetadata).toEqual({
      provider: { thoughtSignature: 'sig123' },
    });
  });

  it('should handle multiple concurrent tool calls', () => {
    const tracker = new StreamingToolCallTracker({
      generateId: () => 'gen-id',
    });
    const controller = createMockController();

    tracker.handleDelta(
      {
        index: 0,
        id: 'call_1',
        function: { name: 'fn1', arguments: '{"a":' },
      },
      controller,
    );
    tracker.handleDelta(
      {
        index: 1,
        id: 'call_2',
        function: { name: 'fn2', arguments: '{"b":' },
      },
      controller,
    );
    tracker.handleDelta(
      { index: 0, function: { arguments: ' 1}' } },
      controller,
    );
    tracker.handleDelta(
      { index: 1, function: { arguments: ' 2}' } },
      controller,
    );

    tracker.flush(controller);

    const toolCalls = controller.chunks.filter(c => c.type === 'tool-call');
    expect(toolCalls).toHaveLength(2);
    expect((toolCalls[0] as any).input).toBe('{"a": 1}');
    expect((toolCalls[1] as any).input).toBe('{"b": 2}');
  });

  it('should skip deltas for finished tool calls', () => {
    const tracker = new StreamingToolCallTracker({
      generateId: () => 'gen-id',
    });
    const controller = createMockController();

    tracker.handleDelta(
      {
        index: 0,
        id: 'call_1',
        function: { name: 'fn', arguments: '{}' },
      },
      controller,
    );

    tracker.flush(controller);
    const chunkCountAfterFlush = controller.chunks.length;

    // Late delta after flush should be ignored
    tracker.handleDelta(
      { index: 0, function: { arguments: 'extra' } },
      controller,
    );

    expect(controller.chunks.length).toBe(chunkCountAfterFlush);
  });
});
