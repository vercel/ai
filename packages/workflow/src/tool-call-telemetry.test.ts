import { AI_SDK_TELEMETRY_TRACING_CHANNEL } from 'ai';
import { tracingChannel } from 'node:diagnostics_channel';
import { describe, expect, it } from 'vitest';
import {
  deserializeToolError,
  dispatchToolCallTelemetryStep,
  serializeToolError,
} from './tool-call-telemetry.js';

describe('tool-call-telemetry error serialization', () => {
  it('serializes and deserializes standard Error instances', () => {
    const original = new Error('Database connection failed');
    const serialized = serializeToolError(original);

    expect(serialized).toEqual({
      isErrorInstance: true,
      name: 'Error',
      message: 'Database connection failed',
      stack: original.stack,
    });

    const deserialized = deserializeToolError(serialized);
    expect(deserialized).toBeInstanceOf(Error);
    expect((deserialized as Error).name).toBe('Error');
    expect((deserialized as Error).message).toBe('Database connection failed');
    expect((deserialized as Error).stack).toBe(original.stack);
  });

  it('serializes and deserializes custom error types', () => {
    const original = new TypeError('Invalid argument type');
    const serialized = serializeToolError(original);

    expect(serialized).toEqual({
      isErrorInstance: true,
      name: 'TypeError',
      message: 'Invalid argument type',
      stack: original.stack,
    });

    const deserialized = deserializeToolError(serialized);
    expect(deserialized).toBeInstanceOf(Error);
    expect((deserialized as Error).name).toBe('TypeError');
    expect((deserialized as Error).message).toBe('Invalid argument type');
  });

  it('serializes and deserializes string error values', () => {
    const original = 'Failed with raw string error';
    const serialized = serializeToolError(original);

    expect(serialized).toEqual({
      isErrorInstance: false,
      value: 'Failed with raw string error',
    });

    const deserialized = deserializeToolError(serialized);
    expect(deserialized).toBe('Failed with raw string error');
  });

  it('serializes and deserializes structured object error values', () => {
    const original = { code: 503, reason: 'Service Unavailable' };
    const serialized = serializeToolError(original);

    expect(serialized).toEqual({
      isErrorInstance: false,
      value: { code: 503, reason: 'Service Unavailable' },
    });

    const deserialized = deserializeToolError(serialized);
    expect(deserialized).toEqual({ code: 503, reason: 'Service Unavailable' });
  });

  it('serializes and deserializes primitive non-error values', () => {
    for (const val of [42, false, null, undefined]) {
      const serialized = serializeToolError(val);
      expect(serialized).toEqual({
        isErrorInstance: false,
        value: val,
      });
      const deserialized = deserializeToolError(serialized);
      expect(deserialized).toBe(val);
    }
  });
});

describe('dispatchToolCallTelemetryStep diagnostics channel', () => {
  it('completes executeTool tracing-channel span with output, toolExecutionMs, and filtered toolContext', async () => {
    const asyncEndMessages: Array<{
      type: string;
      event: Record<string, unknown>;
      result?: unknown;
    }> = [];

    const channel = tracingChannel(AI_SDK_TELEMETRY_TRACING_CHANNEL);
    const subscribers = {
      start() {},
      end() {},
      asyncStart() {},
      asyncEnd(message: unknown) {
        const msg = message as {
          type: string;
          event: Record<string, unknown>;
          result?: unknown;
        };
        if (msg.type === 'executeTool') {
          asyncEndMessages.push({
            type: msg.type,
            event: { ...msg.event },
            result: msg.result,
          });
        }
      },
      error() {},
    };

    channel.subscribe(subscribers);
    try {
      await dispatchToolCallTelemetryStep({
        telemetry: {
          functionId: 'tool-step-test',
          stepNumber: 0,
          includeToolsContext: {
            echoStep: { allowedKey: true },
          },
        },
        provider: 'test-provider',
        modelId: 'test-model',
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'echoStep',
          input: { message: 'hello' },
        },
        toolContext: { allowedKey: 'public-data' },
        messages: [],
        toolExecutionMs: 42,
        toolOutput: {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'echoStep',
          input: { message: 'hello' },
          output: 'echo: hello',
        },
      });
    } finally {
      channel.unsubscribe(subscribers);
    }

    expect(asyncEndMessages).toHaveLength(1);
    expect(asyncEndMessages[0].event.toolContext).toEqual({
      allowedKey: 'public-data',
    });
    expect(asyncEndMessages[0].result).toEqual({
      output: {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'echoStep',
        input: { message: 'hello' },
        output: 'echo: hello',
      },
      toolExecutionMs: 42,
    });
  });
});
