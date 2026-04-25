import { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { StreamingToolCallTracker } from './streaming-tool-call-tracker';

function createCollector() {
  const parts: LanguageModelV4StreamPart[] = [];
  const enqueue = (part: LanguageModelV4StreamPart) => parts.push(part);
  return { parts, enqueue };
}

describe('StreamingToolCallTracker', () => {
  describe('processDelta', () => {
    it('should handle a single tool call accumulated across multiple deltas', () => {
      const tracker = new StreamingToolCallTracker();
      const { parts, enqueue } = createCollector();

      // First delta: new tool call with id and name
      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"ci' },
        },
        enqueue,
      );

      expect(parts).toEqual([
        { type: 'tool-input-start', id: 'call_1', toolName: 'get_weather' },
        { type: 'tool-input-delta', id: 'call_1', delta: '{"ci' },
      ]);

      parts.length = 0;

      // Second delta: more arguments
      tracker.processDelta(
        {
          index: 0,
          function: { arguments: 'ty": "San' },
        },
        enqueue,
      );

      expect(parts).toEqual([
        {
          type: 'tool-input-delta',
          id: 'call_1',
          delta: 'ty": "San',
        },
      ]);

      parts.length = 0;

      // Third delta: completes the JSON
      tracker.processDelta(
        {
          index: 0,
          function: { arguments: ' Francisco"}' },
        },
        enqueue,
      );

      expect(parts).toEqual([
        {
          type: 'tool-input-delta',
          id: 'call_1',
          delta: ' Francisco"}',
        },
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
      const tracker = new StreamingToolCallTracker();
      const { parts, enqueue } = createCollector();

      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"city": "London"}',
          },
        },
        enqueue,
      );

      expect(parts).toEqual([
        { type: 'tool-input-start', id: 'call_1', toolName: 'get_weather' },
        {
          type: 'tool-input-delta',
          id: 'call_1',
          delta: '{"city": "London"}',
        },
        { type: 'tool-input-end', id: 'call_1' },
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'get_weather',
          input: '{"city": "London"}',
        },
      ]);
    });

    it('should handle multiple concurrent tool calls', () => {
      const tracker = new StreamingToolCallTracker();
      const { parts, enqueue } = createCollector();

      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'get_weather', arguments: '' },
        },
        enqueue,
      );

      tracker.processDelta(
        {
          index: 1,
          id: 'call_2',
          type: 'function',
          function: { name: 'get_time', arguments: '' },
        },
        enqueue,
      );

      expect(parts).toEqual([
        { type: 'tool-input-start', id: 'call_1', toolName: 'get_weather' },
        { type: 'tool-input-start', id: 'call_2', toolName: 'get_time' },
      ]);
    });

    it('should skip deltas for already-finished tool calls', () => {
      const tracker = new StreamingToolCallTracker();
      const { parts, enqueue } = createCollector();

      // Complete tool call in one chunk
      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '{}' },
        },
        enqueue,
      );

      parts.length = 0;

      // Late delta for the same tool call
      tracker.processDelta(
        {
          index: 0,
          function: { arguments: 'extra' },
        },
        enqueue,
      );

      expect(parts).toEqual([]);
    });

    it('should skip delta emission when arguments are null', () => {
      const tracker = new StreamingToolCallTracker();
      const { parts, enqueue } = createCollector();

      // Create tool call
      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '' },
        },
        enqueue,
      );

      parts.length = 0;

      // Delta with null arguments
      tracker.processDelta(
        {
          index: 0,
          function: { arguments: null },
        },
        enqueue,
      );

      expect(parts).toEqual([]);
    });

    it('should use index fallback when index is not provided', () => {
      const tracker = new StreamingToolCallTracker();
      const { parts, enqueue } = createCollector();

      tracker.processDelta(
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'fn1', arguments: '{}' },
        },
        enqueue,
      );

      tracker.processDelta(
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'fn2', arguments: '{}' },
        },
        enqueue,
      );

      expect(parts.filter(p => p.type === 'tool-input-start')).toEqual([
        { type: 'tool-input-start', id: 'call_1', toolName: 'fn1' },
        { type: 'tool-input-start', id: 'call_2', toolName: 'fn2' },
      ]);
    });

    it('should throw when id is missing', () => {
      const tracker = new StreamingToolCallTracker();
      const { enqueue } = createCollector();

      expect(() =>
        tracker.processDelta(
          {
            index: 0,
            type: 'function',
            function: { name: 'fn' },
          },
          enqueue,
        ),
      ).toThrow("Expected 'id' to be a string.");
    });

    it('should throw on flush when function.name is never provided', () => {
      // function.name is allowed to arrive in a later delta. The error is
      // surfaced only when the stream closes without a name ever showing up.
      const tracker = new StreamingToolCallTracker();
      const { enqueue } = createCollector();

      expect(() =>
        tracker.processDelta(
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: {},
          },
          enqueue,
        ),
      ).not.toThrow();

      expect(() => tracker.flush(enqueue)).toThrow(
        "Expected 'function.name' to be a string.",
      );
    });

    it('should accept function.name arriving in a later delta', () => {
      // OpenAI-compatible providers can send `id` + `function.arguments`
      // first and `function.name` in a subsequent delta. The tracker must
      // hold the call open until the name arrives, then accumulate.
      const tracker = new StreamingToolCallTracker();
      const { enqueue, parts } = createCollector();

      tracker.processDelta(
        {
          index: 0,
          id: 'call_late_name',
          type: 'function',
          function: { arguments: '' },
        },
        enqueue,
      );

      tracker.processDelta(
        {
          index: 0,
          id: 'call_late_name',
          type: 'function',
          function: { name: 'bash', arguments: '{' },
        },
        enqueue,
      );

      tracker.processDelta(
        {
          index: 0,
          function: { arguments: '"command":"ls"}' },
        },
        enqueue,
      );

      // Stream closer for OpenAI-compatible chunking is the chat-loop's
      // flush — call it explicitly here even though the JSON happens to
      // be parseable, to mirror the real codepath.
      tracker.flush(enqueue);

      const startEvents = parts.filter(p => p.type === 'tool-input-start');
      const callEvents = parts.filter(p => p.type === 'tool-call');

      expect(startEvents).toEqual([
        { type: 'tool-input-start', id: 'call_late_name', toolName: 'bash' },
      ]);
      expect(callEvents).toEqual([
        {
          type: 'tool-call',
          toolCallId: 'call_late_name',
          toolName: 'bash',
          input: '{"command":"ls"}',
        },
      ]);

      // No tool-input-delta should leak before the name arrives.
      const deltaEvents = parts.filter(p => p.type === 'tool-input-delta');
      expect(deltaEvents.length).toBeGreaterThan(0);
      expect(parts.indexOf(deltaEvents[0])).toBeGreaterThan(
        parts.indexOf(startEvents[0]),
      );
    });
  });

  describe('typeValidation', () => {
    it('should not validate type with typeValidation: none', () => {
      const tracker = new StreamingToolCallTracker({
        typeValidation: 'none',
      });
      const { enqueue } = createCollector();

      // Should not throw even with a non-function type
      expect(() =>
        tracker.processDelta(
          {
            index: 0,
            id: 'call_1',
            type: 'custom',
            function: { name: 'fn', arguments: '' },
          },
          enqueue,
        ),
      ).not.toThrow();
    });

    it('should validate type when present with typeValidation: if-present', () => {
      const tracker = new StreamingToolCallTracker({
        typeValidation: 'if-present',
      });
      const { enqueue } = createCollector();

      // Should throw for non-function type
      expect(() =>
        tracker.processDelta(
          {
            index: 0,
            id: 'call_1',
            type: 'custom',
            function: { name: 'fn', arguments: '' },
          },
          enqueue,
        ),
      ).toThrow("Expected 'function' type.");

      // Should not throw when type is null
      expect(() =>
        tracker.processDelta(
          {
            index: 0,
            id: 'call_1',
            function: { name: 'fn', arguments: '' },
          },
          enqueue,
        ),
      ).not.toThrow();
    });

    it('should require function type with typeValidation: required', () => {
      const tracker = new StreamingToolCallTracker({
        typeValidation: 'required',
      });
      const { enqueue } = createCollector();

      // Should throw when type is null/undefined
      expect(() =>
        tracker.processDelta(
          {
            index: 0,
            id: 'call_1',
            function: { name: 'fn', arguments: '' },
          },
          enqueue,
        ),
      ).toThrow("Expected 'function' type.");

      // Should not throw for 'function' type
      expect(() =>
        tracker.processDelta(
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'fn', arguments: '' },
          },
          enqueue,
        ),
      ).not.toThrow();
    });
  });

  describe('flush', () => {
    it('should finalize unfinished tool calls on flush', () => {
      const tracker = new StreamingToolCallTracker();
      const { parts, enqueue } = createCollector();

      // Start a tool call but don't complete it
      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '{"key": "val' },
        },
        enqueue,
      );

      parts.length = 0;

      // Flush should finalize
      tracker.flush(enqueue);

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
      const tracker = new StreamingToolCallTracker();
      const { parts, enqueue } = createCollector();

      // Complete tool call in one chunk
      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '{}' },
        },
        enqueue,
      );

      parts.length = 0;

      tracker.flush(enqueue);

      // No events should be emitted since tool call was already finished
      expect(parts).toEqual([]);
    });
  });

  describe('metadata', () => {
    it('should extract and include provider metadata in tool-call events', () => {
      const tracker = new StreamingToolCallTracker({
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
      const { parts, enqueue } = createCollector();

      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '{}' },
          extra_content: { google: { thought_signature: 'sig123' } },
        } as any,
        enqueue,
      );

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
      const tracker = new StreamingToolCallTracker({
        extractMetadata: () => ({ custom: { key: 'value' } }),
        buildToolCallProviderMetadata: metadata => {
          return metadata ? { provider: metadata } : undefined;
        },
      });
      const { parts, enqueue } = createCollector();

      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '{"incomplete' },
        },
        enqueue,
      );

      parts.length = 0;

      tracker.flush(enqueue);

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
      const tracker = new StreamingToolCallTracker({
        extractMetadata: () => undefined,
        buildToolCallProviderMetadata: () => undefined,
      });
      const { parts, enqueue } = createCollector();

      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '{}' },
        },
        enqueue,
      );

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
      const tracker = new StreamingToolCallTracker({
        generateId: mockGenerateId,
      });
      const { parts, enqueue } = createCollector();

      // Start a tool call
      tracker.processDelta(
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'fn', arguments: '{"key": "val' },
        },
        enqueue,
      );

      parts.length = 0;

      // Flush to finalize
      tracker.flush(enqueue);

      // The toolCallId should use the original id since it's present
      const toolCallEvent = parts.find(p => p.type === 'tool-call');
      expect(toolCallEvent).toMatchObject({
        toolCallId: 'call_1',
      });
    });
  });
});
