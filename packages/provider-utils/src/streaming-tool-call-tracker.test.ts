import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { StreamingToolCallTracker } from './streaming-tool-call-tracker';

function createCollector() {
  const parts: LanguageModelV3StreamPart[] = [];
  return {
    parts,
    controller: {
      enqueue: (part: LanguageModelV3StreamPart) => parts.push(part),
    },
  };
}

function getToolCalls(parts: LanguageModelV3StreamPart[]) {
  return parts.filter(part => part.type === 'tool-call');
}

describe('StreamingToolCallTracker', () => {
  it('preserves calls when ids are omitted and an index is reused', () => {
    const { parts, controller } = createCollector();
    const generateId = vi
      .fn<() => string>()
      .mockReturnValueOnce('generated-1')
      .mockReturnValueOnce('generated-2')
      .mockReturnValueOnce('generated-3');
    const tracker = new StreamingToolCallTracker(controller, { generateId });

    tracker.processDelta({
      index: 0,
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"p0"}' },
    });
    tracker.processDelta({
      index: 0,
      type: 'function',
      function: { name: 'write_file', arguments: '{"path":"p1"}' },
    });
    tracker.processDelta({
      index: 0,
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"p2"}' },
    });
    tracker.flush();

    expect(getToolCalls(parts)).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'generated-1',
        toolName: 'read_file',
        input: '{"path":"p0"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'generated-2',
        toolName: 'write_file',
        input: '{"path":"p1"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'generated-3',
        toolName: 'read_file',
        input: '{"path":"p2"}',
      },
    ]);
  });

  it('uses index evidence for a continuation with a blank id', () => {
    const { parts, controller } = createCollector();
    const tracker = new StreamingToolCallTracker(controller);

    tracker.processDelta({
      index: 0,
      id: 'call_a',
      type: 'function',
      function: { name: 'read_file', arguments: '{"pa' },
    });
    tracker.processDelta({
      index: 0,
      id: '   ',
      function: { arguments: 'th":"a"}' },
    });
    tracker.flush();

    expect(getToolCalls(parts)).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call_a',
        toolName: 'read_file',
        input: '{"path":"a"}',
      },
    ]);
  });

  it('keeps repeated wire ids on distinct indices separate', () => {
    const { parts, controller } = createCollector();
    const tracker = new StreamingToolCallTracker(controller, {
      generateId: () => 'generated',
    });

    tracker.processDelta({
      index: 0,
      id: 'dup',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"a"}' },
    });
    tracker.processDelta({
      index: 1,
      id: 'dup',
      type: 'function',
      function: { name: 'write_file', arguments: '{"path":"b"}' },
    });
    tracker.flush();

    expect(getToolCalls(parts)).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'dup',
        toolName: 'read_file',
        input: '{"path":"a"}',
      },
      {
        type: 'tool-call',
        toolCallId: 'generated',
        toolName: 'write_file',
        input: '{"path":"b"}',
      },
    ]);
  });

  it.each([undefined, '', '   '])('rejects an unusable function name', name => {
    const { controller } = createCollector();
    const tracker = new StreamingToolCallTracker(controller);

    expect(() =>
      tracker.processDelta({
        index: 0,
        id: 'call_a',
        type: 'function',
        function: { name },
      }),
    ).toThrow("Expected 'function.name' to be a string.");
  });

  it('ignores a delta that is ambiguous across active calls', () => {
    const { parts, controller } = createCollector();
    const tracker = new StreamingToolCallTracker(controller);

    tracker.processDelta({
      index: 0,
      id: 'call_a',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"a"}' },
    });
    tracker.processDelta({
      index: 1,
      id: 'call_b',
      type: 'function',
      function: { name: 'write_file', arguments: '{"path":"b"}' },
    });
    tracker.processDelta({
      function: { arguments: '{"unattributed":true}' },
    });
    tracker.flush();

    expect(getToolCalls(parts).map(call => call.input)).toEqual([
      '{"path":"a"}',
      '{"path":"b"}',
    ]);
  });

  it('uses a changed id to continue an incomplete matching call', () => {
    const { parts, controller } = createCollector();
    const tracker = new StreamingToolCallTracker(controller);

    tracker.processDelta({
      index: 0,
      id: 'call_a',
      type: 'function',
      function: { name: 'read_file', arguments: '{"pa' },
    });
    tracker.processDelta({
      index: 0,
      id: 'call_b',
      type: 'function',
      function: { name: 'read_file', arguments: 'th":"a"}' },
    });
    tracker.flush();

    expect(getToolCalls(parts)).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call_a',
        toolName: 'read_file',
        input: '{"path":"a"}',
      },
    ]);
  });

  it('emits fully indexed calls in index order', () => {
    const { parts, controller } = createCollector();
    const tracker = new StreamingToolCallTracker(controller);

    tracker.processDelta({
      index: 1,
      id: 'call_1',
      type: 'function',
      function: { name: 'second', arguments: '{}' },
    });
    tracker.processDelta({
      index: 0,
      id: 'call_0',
      type: 'function',
      function: { name: 'first', arguments: '{}' },
    });
    tracker.flush();

    expect(getToolCalls(parts).map(call => call.toolName)).toEqual([
      'first',
      'second',
    ]);
  });

  it('creates bounded unique fallbacks for repeated generated ids', () => {
    const { parts, controller } = createCollector();
    const tracker = new StreamingToolCallTracker(controller, {
      generateId: () => '',
    });

    tracker.processDelta({
      index: 0,
      function: { name: 'first', arguments: '{}' },
    });
    tracker.processDelta({
      index: 1,
      function: { name: 'second', arguments: '{}' },
    });
    tracker.processDelta({
      index: 2,
      function: { name: 'third', arguments: '{}' },
    });
    tracker.flush();

    expect(getToolCalls(parts).map(call => call.toolCallId)).toEqual([
      'tool-call',
      'tool-call-1',
      'tool-call-2',
    ]);
  });
});
