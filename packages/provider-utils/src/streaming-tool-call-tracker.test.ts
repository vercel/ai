import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { StreamingToolCallTracker } from './streaming-tool-call-tracker';

function createCollector() {
  const parts: LanguageModelV4StreamPart[] = [];
  const controller = {
    enqueue: (part: LanguageModelV4StreamPart) => parts.push(part),
  };
  return { parts, controller };
}

describe('StreamingToolCallTracker', () => {
  describe('processDelta', () => {
    it('should handle a single tool call accumulated across multiple deltas', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      // First delta: new tool call with id and name
      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"ci' },
      });

      expect(parts).toEqual([
        { type: 'tool-input-start', id: 'call_1', toolName: 'get_weather' },
        { type: 'tool-input-delta', id: 'call_1', delta: '{"ci' },
      ]);

      parts.length = 0;

      // Second delta: more arguments
      tracker.processDelta({
        index: 0,
        function: { arguments: 'ty": "San' },
      });

      expect(parts).toEqual([
        {
          type: 'tool-input-delta',
          id: 'call_1',
          delta: 'ty": "San',
        },
      ]);

      parts.length = 0;

      // Third delta: completes the JSON — must not finalize before flush,
      // since a parsable buffer can still be the prefix of longer arguments
      tracker.processDelta({
        index: 0,
        function: { arguments: ' Francisco"}' },
      });

      expect(parts).toEqual([
        {
          type: 'tool-input-delta',
          id: 'call_1',
          delta: ' Francisco"}',
        },
      ]);

      parts.length = 0;

      tracker.flush();

      expect(parts).toEqual([
        { type: 'tool-input-end', id: 'call_1' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'get_weather',
          input: '{"city": "San Francisco"}',
        },
      ]);
    });

    it('should handle a full tool call in a single chunk', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city": "London"}',
        },
      });

      expect(parts).toEqual([
        { type: 'tool-input-start', id: 'call_1', toolName: 'get_weather' },
        {
          type: 'tool-input-delta',
          id: 'call_1',
          delta: '{"city": "London"}',
        },
      ]);

      parts.length = 0;

      tracker.flush();

      expect(parts).toEqual([
        { type: 'tool-input-end', id: 'call_1' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'get_weather',
          input: '{"city": "London"}',
        },
      ]);
    });

    it('should not finalize a tool call when its argument prefix is parsable JSON', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'search', arguments: '{"query": "test"}' },
      });

      // the parsable prefix must not emit tool-input-end / tool-call
      expect(parts.map(part => part.type)).toEqual([
        'tool-input-start',
        'tool-input-delta',
      ]);

      tracker.processDelta({
        index: 0,
        function: { arguments: ', "limit": 10}' },
      });

      tracker.flush();

      expect(parts.at(-1)).toEqual({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'search',
        input: '{"query": "test"}, "limit": 10}',
      });

      expect(parts.filter(part => part.type === 'tool-call')).toHaveLength(1);
    });

    it('should handle multiple concurrent tool calls', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'get_weather', arguments: '' },
      });

      tracker.processDelta({
        index: 1,
        id: 'call_2',
        type: 'function',
        function: { name: 'get_time', arguments: '' },
      });

      expect(parts).toEqual([
        { type: 'tool-input-start', id: 'call_1', toolName: 'get_weather' },
        { type: 'tool-input-start', id: 'call_2', toolName: 'get_time' },
      ]);
    });

    it('should handle non-zero and non-contiguous indexes', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 1,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn1', arguments: '{"value":1}' },
      });

      tracker.processDelta({
        index: 3,
        id: 'call_2',
        type: 'function',
        function: { name: 'fn2', arguments: '{"value":2}' },
      });

      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'fn1',
          input: '{"value":1}',
        },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'fn2',
          input: '{"value":2}',
        },
      ]);
    });

    it('should keep distinct tool calls that reuse an index', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '{"value":1}' },
      });

      tracker.processDelta({
        index: 0,
        id: 'call_2',
        type: 'function',
        function: { name: 'fn', arguments: '{"value":2}' },
      });

      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'fn',
          input: '{"value":1}',
        },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'fn',
          input: '{"value":2}',
        },
      ]);
    });

    it.each([undefined, 7])(
      'should continue the latest tool call when an index is omitted after starting at %s',
      index => {
        const { parts, controller } = createCollector();
        const tracker = new StreamingToolCallTracker(controller);

        tracker.processDelta({
          index,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '{"val' },
        });

        tracker.processDelta({
          function: { arguments: 'ue":1}' },
        });

        tracker.flush();

        expect(parts.filter(part => part.type === 'tool-call')).toEqual([
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'fn',
            input: '{"value":1}',
          },
        ]);
      },
    );

    it('should use the index when continuation IDs are empty', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '{"val' },
      });

      tracker.processDelta({
        index: 0,
        id: '',
        type: 'function',
        function: { arguments: 'ue":1}' },
      });

      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'fn',
          input: '{"value":1}',
        },
      ]);
    });

    it('should skip deltas for already-finished tool calls', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '{}' },
      });

      // Finalize via flush
      tracker.flush();

      parts.length = 0;

      // Late delta for the same tool call
      tracker.processDelta({
        index: 0,
        function: { arguments: 'extra' },
      });

      expect(parts).toEqual([]);
    });

    it('should skip delta emission when arguments are null', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      // Create tool call
      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '' },
      });

      parts.length = 0;

      // Delta with null arguments
      tracker.processDelta({
        index: 0,
        function: { arguments: null },
      });

      expect(parts).toEqual([]);
    });

    it('should use index fallback when index is not provided', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        id: 'call_1',
        type: 'function',
        function: { name: 'fn1', arguments: '{}' },
      });

      tracker.processDelta({
        id: 'call_2',
        type: 'function',
        function: { name: 'fn2', arguments: '{}' },
      });

      expect(parts.filter(p => p.type === 'tool-input-start')).toEqual([
        { type: 'tool-input-start', id: 'call_1', toolName: 'fn1' },
        { type: 'tool-input-start', id: 'call_2', toolName: 'fn2' },
      ]);
    });

    it('should generate an id when id is missing', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        generateId: () => 'generated-id',
      });

      tracker.processDelta({
        index: 0,
        type: 'function',
        function: { name: 'fn', arguments: '{}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'generated-id',
          toolName: 'fn',
          input: '{}',
        },
      ]);
    });

    it.each([undefined, null])(
      'should throw when function.name is missing',
      name => {
        const { controller } = createCollector();
        const tracker = new StreamingToolCallTracker(controller);

        expect(() =>
          tracker.processDelta({
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name },
          }),
        ).toThrow("Expected 'function.name' to be a string.");
      },
    );

    it.each(['', '   '])(
      'should ignore a blank function name without preventing prior calls from finalizing',
      name => {
        const { parts, controller } = createCollector();
        const tracker = new StreamingToolCallTracker(controller);

        tracker.processDelta({
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'valid_tool', arguments: '{"value":1}' },
        });

        expect(() =>
          tracker.processDelta({
            index: 1,
            id: 'call_2',
            type: 'function',
            function: { name, arguments: '{"value":2}' },
          }),
        ).not.toThrow();

        tracker.flush();

        expect(parts.filter(part => part.type === 'tool-call')).toEqual([
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'valid_tool',
            input: '{"value":1}',
          },
        ]);
      },
    );

    it.each([
      {
        description: 'blank name with a matching id',
        name: '',
        continuation: { id: 'call_1' },
      },
      {
        description: 'whitespace-only name with a matching index',
        name: '   ',
        continuation: { index: 0 },
      },
    ])(
      'should retain continuation arguments for a $description',
      ({ name, continuation }) => {
        const { parts, controller } = createCollector();
        const tracker = new StreamingToolCallTracker(controller);

        tracker.processDelta({
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"pa' },
        });
        tracker.processDelta({
          ...continuation,
          function: { name, arguments: 'th":"a"}' },
        });
        tracker.flush();

        expect(parts.filter(part => part.type === 'tool-call')).toEqual([
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'read_file',
            input: '{"path":"a"}',
          },
        ]);
      },
    );

    it('should keep id-less calls distinct when an index is reused and type is omitted', () => {
      const { parts, controller } = createCollector();
      const generateId = vi
        .fn<() => string>()
        .mockReturnValueOnce('generated-1')
        .mockReturnValueOnce('generated-2')
        .mockReturnValueOnce('generated-3');
      const tracker = new StreamingToolCallTracker(controller, { generateId });

      tracker.processDelta({
        index: 0,
        function: { name: 'read_file', arguments: '{"path":"p0"}' },
      });
      tracker.processDelta({
        index: 0,
        function: { name: 'write_file', arguments: '{"path":"p1"}' },
      });
      tracker.processDelta({
        index: 0,
        function: { name: 'read_file', arguments: '{"path":"p2"}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
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

    it.each([
      { description: 'missing ids', id: undefined },
      { description: 'a repeated id', id: 'dup' },
    ])(
      'should keep complete same-name calls distinct with $description and a reused index',
      ({ id }) => {
        const { parts, controller } = createCollector();
        const tracker = new StreamingToolCallTracker(controller, {
          generateId: () => 'generated-id',
        });

        tracker.processDelta({
          index: 0,
          id,
          type: 'function',
          function: { name: 'same_tool', arguments: '{"value":1}' },
        });
        tracker.processDelta({
          index: 0,
          id,
          type: 'function',
          function: { name: 'same_tool', arguments: '{"value":2}' },
        });
        tracker.flush();

        const toolCalls = parts.filter(part => part.type === 'tool-call');
        expect(toolCalls.map(toolCall => toolCall.input)).toEqual([
          '{"value":1}',
          '{"value":2}',
        ]);
        expect(
          new Set(toolCalls.map(toolCall => toolCall.toolCallId)).size,
        ).toBe(2);
      },
    );

    it.each([
      { description: 'missing ids', id: undefined },
      { description: 'a repeated id', id: 'dup' },
    ])(
      'should keep a partial same-name call distinct with $description and a reused index',
      ({ id }) => {
        const { parts, controller } = createCollector();
        const tracker = new StreamingToolCallTracker(controller, {
          generateId: () => 'generated-id',
        });

        tracker.processDelta({
          index: 0,
          id,
          type: 'function',
          function: { name: 'same_tool', arguments: '{"value":1}' },
        });
        tracker.processDelta({
          index: 0,
          id,
          type: 'function',
          function: { name: 'same_tool', arguments: '{"value":' },
        });
        tracker.flush();

        const toolCalls = parts.filter(part => part.type === 'tool-call');
        expect(toolCalls.map(toolCall => toolCall.input)).toEqual([
          '{"value":1}',
          '{"value":',
        ]);
        expect(
          new Set(toolCalls.map(toolCall => toolCall.toolCallId)).size,
        ).toBe(2);
      },
    );

    it('should keep interleaved same-name calls with distinct ids and a reused index separate', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'same_tool', arguments: '{"value":' },
      });
      tracker.processDelta({
        index: 0,
        id: 'call_2',
        type: 'function',
        function: { name: 'same_tool', arguments: '{"value":2}' },
      });
      tracker.processDelta({
        index: 0,
        id: 'call_1',
        function: { arguments: '1}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'same_tool',
          input: '{"value":1}',
        },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'same_tool',
          input: '{"value":2}',
        },
      ]);
    });

    it('should ignore an index-only continuation after the index is reused', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'first', arguments: '{"value":1}' },
      });
      tracker.processDelta({
        index: 0,
        id: 'call_2',
        type: 'function',
        function: { name: 'second', arguments: '{"value":2}' },
      });
      tracker.processDelta({
        index: 0,
        function: { arguments: '{"unattributed":true}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'first',
          input: '{"value":1}',
        },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'second',
          input: '{"value":2}',
        },
      ]);
    });

    it('should use the index when continuation ids are blank', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'read_file', arguments: '{"pa' },
      });
      tracker.processDelta({
        index: 0,
        id: '   ',
        function: { arguments: 'th":"a"}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'read_file',
          input: '{"path":"a"}',
        },
      ]);
    });

    it('should generate unique ids for blank and repeated ids', () => {
      const { parts, controller } = createCollector();
      const generateId = vi
        .fn<() => string>()
        .mockReturnValueOnce('generated-1')
        .mockReturnValueOnce('generated-2');
      const tracker = new StreamingToolCallTracker(controller, { generateId });

      tracker.processDelta({
        index: 0,
        id: '',
        type: 'function',
        function: { name: 'read_file', arguments: '{}' },
      });
      tracker.processDelta({
        index: 1,
        id: 'dup',
        type: 'function',
        function: { name: 'read_file', arguments: '{}' },
      });
      tracker.processDelta({
        index: 2,
        id: 'dup',
        type: 'function',
        function: { name: 'write_file', arguments: '{}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'generated-1',
          toolName: 'read_file',
          input: '{}',
        },
        {
          type: 'tool-call',
          toolCallId: 'dup',
          toolName: 'read_file',
          input: '{}',
        },
        {
          type: 'tool-call',
          toolCallId: 'generated-2',
          toolName: 'write_file',
          input: '{}',
        },
      ]);
    });

    it('should keep same-name calls with repeated ids and distinct indices separate', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        generateId: () => 'generated-id',
      });

      tracker.processDelta({
        index: 0,
        id: 'dup',
        type: 'function',
        function: { name: 'same_tool', arguments: '{"value":0}' },
      });
      tracker.processDelta({
        index: 1,
        id: 'dup',
        type: 'function',
        function: { name: 'same_tool', arguments: '{"value":1}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'dup',
          toolName: 'same_tool',
          input: '{"value":0}',
        },
        {
          type: 'tool-call',
          toolCallId: 'generated-id',
          toolName: 'same_tool',
          input: '{"value":1}',
        },
      ]);
    });

    it('should preserve nonblank ids and function names exactly', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: ' spaced ',
        type: 'function',
        function: { name: ' same_tool ', arguments: '{"value":' },
      });
      tracker.processDelta({
        index: 0,
        id: ' spaced ',
        function: { arguments: '0}' },
      });
      tracker.processDelta({
        index: 1,
        id: 'spaced',
        type: 'function',
        function: { name: ' same_tool ', arguments: '{"value":1}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: ' spaced ',
          toolName: ' same_tool ',
          input: '{"value":0}',
        },
        {
          type: 'tool-call',
          toolCallId: 'spaced',
          toolName: ' same_tool ',
          input: '{"value":1}',
        },
      ]);
    });

    it('should create bounded unique ids when generateId returns duplicates', () => {
      const { parts, controller } = createCollector();
      const generateId = vi.fn<() => string>().mockReturnValue('generated-id');
      const tracker = new StreamingToolCallTracker(controller, { generateId });

      tracker.processDelta({
        index: 0,
        type: 'function',
        function: { name: 'first', arguments: '{}' },
      });
      tracker.processDelta({
        index: 1,
        type: 'function',
        function: { name: 'second', arguments: '{}' },
      });
      tracker.processDelta({
        index: 2,
        type: 'function',
        function: { name: 'third', arguments: '{}' },
      });
      tracker.flush();

      expect(generateId).toHaveBeenCalledTimes(3);
      expect(
        parts
          .filter(part => part.type === 'tool-call')
          .map(part => part.toolCallId),
      ).toEqual(['generated-id', 'generated-id-1', 'generated-id-2']);
    });

    it('should create usable ids when generateId returns blank values', () => {
      const { parts, controller } = createCollector();
      const generateId = vi.fn<() => string>().mockReturnValue('   ');
      const tracker = new StreamingToolCallTracker(controller, { generateId });

      tracker.processDelta({
        index: 0,
        type: 'function',
        function: { name: 'first', arguments: '{}' },
      });
      tracker.processDelta({
        index: 1,
        type: 'function',
        function: { name: 'second', arguments: '{}' },
      });
      tracker.flush();

      expect(generateId).toHaveBeenCalledTimes(2);
      expect(
        parts
          .filter(part => part.type === 'tool-call')
          .map(part => part.toolCallId),
      ).toEqual(['tool-call', 'tool-call-1']);
    });

    it('should ignore unattributable deltas when multiple calls are active', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'read_file', arguments: '{"path":"a"}' },
      });
      tracker.processDelta({
        index: 1,
        id: 'call_2',
        type: 'function',
        function: { name: 'write_file', arguments: '{"path":"b"}' },
      });
      tracker.processDelta({
        function: { arguments: '{"unattributed":true}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'read_file',
          input: '{"path":"a"}',
        },
        {
          type: 'tool-call',
          toolCallId: 'call_2',
          toolName: 'write_file',
          input: '{"path":"b"}',
        },
      ]);
    });

    it('should ignore an ambiguous continuation for a repeated id', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        generateId: () => 'generated-id',
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
      tracker.processDelta({
        id: 'dup',
        function: { arguments: '{"unattributed":true}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'dup',
          toolName: 'read_file',
          input: '{"path":"a"}',
        },
        {
          type: 'tool-call',
          toolCallId: 'generated-id',
          toolName: 'write_file',
          input: '{"path":"b"}',
        },
      ]);
    });

    it('should use a matching name and index for an id-less continuation', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        typeValidation: 'required',
      });

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'read_file', arguments: '{"pa' },
      });
      tracker.processDelta({
        index: 0,
        function: { name: 'read_file', arguments: 'th":"a"}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'read_file',
          input: '{"path":"a"}',
        },
      ]);
    });

    it('should use the index when a continuation has an unexpected id', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'read_file', arguments: '{"pa' },
      });
      tracker.processDelta({
        index: 0,
        id: 'unexpected',
        function: { arguments: 'th":"a"}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'read_file',
          input: '{"path":"a"}',
        },
      ]);
    });

    it('should continue a call when its id changes but its index and name match', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'read_file', arguments: '{"pa' },
      });
      tracker.processDelta({
        index: 0,
        id: 'unexpected',
        type: 'function',
        function: { name: 'read_file', arguments: 'th":"a"}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'read_file',
          input: '{"path":"a"}',
        },
      ]);
    });

    it('should continue a call when all labels repeat after a parsable argument prefix', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'calculate', arguments: '1' },
      });
      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'calculate', arguments: '2' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'calculate',
          input: '12',
        },
      ]);
    });

    it('should continue a structured argument when repeated labels precede a nested object', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'calculate', arguments: '{"value":' },
      });
      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'calculate', arguments: '{"nested":true}}' },
      });
      tracker.flush();

      expect(parts.filter(part => part.type === 'tool-call')).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'calculate',
          input: '{"value":{"nested":true}}',
        },
      ]);
    });

    it('should emit tool calls in index order', () => {
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

      expect(
        parts
          .filter(part => part.type === 'tool-call')
          .map(part => part.toolName),
      ).toEqual(['first', 'second']);
    });

    it('should preserve insertion order when calls mix present and omitted indices', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        id: 'call_without_index',
        type: 'function',
        function: { name: 'first', arguments: '{}' },
      });
      tracker.processDelta({
        index: 0,
        id: 'call_with_index',
        type: 'function',
        function: { name: 'second', arguments: '{}' },
      });
      tracker.flush();

      expect(
        parts
          .filter(part => part.type === 'tool-call')
          .map(part => part.toolName),
      ).toEqual(['first', 'second']);
    });

    it('should throw when function.name is missing from a new call', () => {
      const { controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      expect(() =>
        tracker.processDelta({
          index: 0,
          id: 'call_1',
          type: 'function',
          function: {},
        }),
      ).toThrow("Expected 'function.name' to be a string.");
    });
  });

  describe('typeValidation', () => {
    it('should not validate type with typeValidation: none', () => {
      const { controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        typeValidation: 'none',
      });

      // Should not throw even with a non-function type
      expect(() =>
        tracker.processDelta({
          index: 0,
          id: 'call_1',
          type: 'custom',
          function: { name: 'fn', arguments: '' },
        }),
      ).not.toThrow();
    });

    it('should validate type when present with typeValidation: if-present', () => {
      const { controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        typeValidation: 'if-present',
      });

      // Should throw for non-function type
      expect(() =>
        tracker.processDelta({
          index: 0,
          id: 'call_1',
          type: 'custom',
          function: { name: 'fn', arguments: '' },
        }),
      ).toThrow("Expected 'function' type.");

      // Should not throw when type is null
      expect(() =>
        tracker.processDelta({
          index: 0,
          id: 'call_1',
          function: { name: 'fn', arguments: '' },
        }),
      ).not.toThrow();
    });

    it('should require function type with typeValidation: required', () => {
      const { controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        typeValidation: 'required',
      });

      // Should throw when type is null/undefined
      expect(() =>
        tracker.processDelta({
          index: 0,
          id: 'call_1',
          function: { name: 'fn', arguments: '' },
        }),
      ).toThrow("Expected 'function' type.");

      // Should not throw for 'function' type
      expect(() =>
        tracker.processDelta({
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '' },
        }),
      ).not.toThrow();
    });
  });

  describe('flush', () => {
    it('should finalize unfinished tool calls on flush', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      // Start a tool call but don't complete it
      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '{"key": "val' },
      });

      parts.length = 0;

      // Flush should finalize
      tracker.flush();

      expect(parts).toEqual([
        { type: 'tool-input-end', id: 'call_1' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'fn',
          input: '{"key": "val',
        },
      ]);
    });

    it('should not re-finalize already finished tool calls', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller);

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '{}' },
      });

      // First flush finalizes the tool call
      tracker.flush();

      parts.length = 0;

      tracker.flush();

      // No events should be emitted since tool call was already finished
      expect(parts).toEqual([]);
    });
  });

  describe('metadata', () => {
    it('should extract and include provider metadata in tool-call events', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        extractMetadata: delta => {
          const sig = (delta as any).extra_content?.google?.thought_signature;
          return sig ? { thoughtSignature: sig } : undefined;
        },
        buildToolCallProviderMetadata: metadata => {
          if (metadata?.thoughtSignature) {
            return { google: { thoughtSignature: metadata.thoughtSignature } };
          }
          return undefined;
        },
      });

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '{}' },
        extra_content: { google: { thought_signature: 'sig123' } },
      } as any);

      tracker.flush();

      const toolCallEvent = parts.find(p => p.type === 'tool-call');
      expect(toolCallEvent).toEqual({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'fn',
        input: '{}',
        providerMetadata: {
          google: { thoughtSignature: 'sig123' },
        },
      });
    });

    it('should include provider metadata for unfinished tool calls finalized in flush', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        extractMetadata: () => ({ custom: { key: 'value' } }),
        buildToolCallProviderMetadata: metadata => {
          return metadata ? { provider: metadata } : undefined;
        },
      });

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '{"incomplete' },
      });

      parts.length = 0;

      tracker.flush();

      const toolCallEvent = parts.find(p => p.type === 'tool-call');
      expect(toolCallEvent).toEqual({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'fn',
        input: '{"incomplete',
        providerMetadata: { provider: { custom: { key: 'value' } } },
      });
    });

    it('should not include providerMetadata when buildToolCallProviderMetadata returns undefined', () => {
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        extractMetadata: () => undefined,
        buildToolCallProviderMetadata: () => undefined,
      });

      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '{}' },
      });

      tracker.flush();

      const toolCallEvent = parts.find(p => p.type === 'tool-call');
      expect(toolCallEvent).toEqual({
        type: 'tool-call',
        toolCallId: 'call_1',
        toolName: 'fn',
        input: '{}',
      });
      expect(toolCallEvent).not.toHaveProperty('providerMetadata');
    });
  });

  describe('generateId', () => {
    it('should use custom generateId for tool call IDs when id is missing in fallback', () => {
      const mockGenerateId = vi.fn(() => 'custom-id');
      const { parts, controller } = createCollector();
      const tracker = new StreamingToolCallTracker(controller, {
        generateId: mockGenerateId,
      });

      // Start a tool call
      tracker.processDelta({
        index: 0,
        id: 'call_1',
        type: 'function',
        function: { name: 'fn', arguments: '{"key": "val' },
      });

      parts.length = 0;

      // Flush to finalize
      tracker.flush();

      // The toolCallId should use the original id since it's present
      const toolCallEvent = parts.find(p => p.type === 'tool-call');
      expect(toolCallEvent).toMatchObject({
        toolCallId: 'call_1',
      });
    });
  });
});
