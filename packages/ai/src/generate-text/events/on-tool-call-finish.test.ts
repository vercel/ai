import { describe, it, expect } from 'vitest';
import { notifyOnToolCallFinish } from './on-tool-call-finish';
import type { OnToolCallFinishEvent } from '../callback-events';

function createMockSuccessEvent(
  overrides: Partial<
    Omit<OnToolCallFinishEvent, 'success' | 'output' | 'error'>
  > & { output?: unknown } = {},
): OnToolCallFinishEvent {
  return {
    stepNumber: 0,
    model: { provider: 'test-provider', modelId: 'test-model' },
    toolCall: {
      type: 'tool-call',
      toolCallId: 'test-tool-call-id',
      toolName: 'testTool',
      input: { arg1: 'value1' },
    },
    messages: [{ role: 'user', content: 'test message' }],
    abortSignal: undefined,
    durationMs: 100,
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    success: true,
    output: { result: 'success' },
    ...overrides,
  };
}

function createMockErrorEvent(
  overrides: Partial<
    Omit<OnToolCallFinishEvent, 'success' | 'output' | 'error'>
  > & { error?: unknown } = {},
): OnToolCallFinishEvent {
  return {
    stepNumber: 0,
    model: { provider: 'test-provider', modelId: 'test-model' },
    toolCall: {
      type: 'tool-call',
      toolCallId: 'test-tool-call-id',
      toolName: 'testTool',
      input: { arg1: 'value1' },
    },
    messages: [{ role: 'user', content: 'test message' }],
    abortSignal: undefined,
    durationMs: 50,
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    success: false,
    error: new Error('Tool execution failed'),
    ...overrides,
  };
}

describe('on-tool-call-finish', () => {
  describe('notifyOnToolCallFinish - callbacks', () => {
    it('should call single callback', async () => {
      const calls: string[] = [];
      const event = createMockSuccessEvent();

      await notifyOnToolCallFinish({
        event,
        callbacks: () => {
          calls.push('callback');
        },
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback",
        ]
      `);
    });

    it('should call array of callbacks', async () => {
      const calls: string[] = [];
      const event = createMockSuccessEvent();

      await notifyOnToolCallFinish({
        event,
        callbacks: [
          () => {
            calls.push('callback 1');
          },
          () => {
            calls.push('callback 2');
          },
        ],
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback 1",
          "callback 2",
        ]
      `);
    });

    it('should handle undefined callbacks', async () => {
      const event = createMockSuccessEvent();

      await expect(
        notifyOnToolCallFinish({ event, callbacks: undefined }),
      ).resolves.toBeUndefined();
    });

    it('should handle omitted callbacks', async () => {
      const event = createMockSuccessEvent();

      await expect(notifyOnToolCallFinish({ event })).resolves.toBeUndefined();
    });

    it('should swallow callback errors and continue', async () => {
      const calls: string[] = [];

      await notifyOnToolCallFinish({
        event: createMockSuccessEvent(),
        callbacks: [
          () => {
            calls.push('before throw');
            throw new Error('callback error');
          },
          () => {
            calls.push('after throw');
          },
        ],
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "before throw",
          "after throw",
        ]
      `);
    });
  });

  describe('notifyOnToolCallFinish - success events', () => {
    it('should propagate output and duration for success', async () => {
      const received: Array<{ output: unknown; durationMs: number }> = [];
      const event = createMockSuccessEvent({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'getWeather',
          input: { location: 'NYC' },
        },
        output: { temperature: 72, condition: 'sunny' },
        durationMs: 15,
      });

      await notifyOnToolCallFinish({
        event,
        callbacks: ev => {
          if (ev.success) {
            received.push({ output: ev.output, durationMs: ev.durationMs });
          }
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "durationMs": 15,
            "output": {
              "condition": "sunny",
              "temperature": 72,
            },
          },
        ]
      `);
    });
  });

  describe('notifyOnToolCallFinish - error events', () => {
    it('should propagate error and duration for failures', async () => {
      const received: Array<{
        error: unknown;
        durationMs: number;
        errorMessage: string;
      }> = [];
      const event = createMockErrorEvent({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-fail',
          toolName: 'riskyOperation',
          input: { dangerous: true },
        },
        error: new Error('Network timeout'),
        durationMs: 30000,
      });

      await notifyOnToolCallFinish({
        event,
        callbacks: ev => {
          if (!ev.success) {
            received.push({
              error: ev.error,
              durationMs: ev.durationMs,
              errorMessage:
                ev.error instanceof Error ? ev.error.message : String(ev.error),
            });
          }
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "durationMs": 30000,
            "error": [Error: Network timeout],
            "errorMessage": "Network timeout",
          },
        ]
      `);
    });

    it('should handle non-Error error objects', async () => {
      const received: Array<{ success: boolean; error: unknown }> = [];
      const event = createMockErrorEvent({
        error: { code: 'RATE_LIMITED', retryAfter: 60 },
      });

      await notifyOnToolCallFinish({
        event,
        callbacks: ev => {
          if (!ev.success) {
            received.push({ success: ev.success, error: ev.error });
          }
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "error": {
              "code": "RATE_LIMITED",
              "retryAfter": 60,
            },
            "success": false,
          },
        ]
      `);
    });
  });

  describe('notifyOnToolCallFinish - discriminated union', () => {
    it('should narrow success vs error via discriminated union', async () => {
      const successOutputs: unknown[] = [];
      const errorMessages: string[] = [];

      await notifyOnToolCallFinish({
        event: createMockSuccessEvent({ output: 'success result' }),
        callbacks: ev => {
          if (ev.success) {
            successOutputs.push(ev.output);
          } else {
            errorMessages.push(
              ev.error instanceof Error ? ev.error.message : String(ev.error),
            );
          }
        },
      });

      await notifyOnToolCallFinish({
        event: createMockErrorEvent({ error: new Error('failure reason') }),
        callbacks: ev => {
          if (ev.success) {
            successOutputs.push(ev.output);
          } else {
            errorMessages.push(
              ev.error instanceof Error ? ev.error.message : String(ev.error),
            );
          }
        },
      });

      expect(successOutputs).toMatchInlineSnapshot(`
        [
          "success result",
        ]
      `);
      expect(errorMessages).toMatchInlineSnapshot(`
        [
          "failure reason",
        ]
      `);
    });
  });

  describe('notifyOnToolCallFinish - mixed sequence', () => {
    it('should handle mixed success and error sequence', async () => {
      const outcomes: Array<{
        toolName: string;
        success: boolean;
        durationMs: number;
      }> = [];

      await notifyOnToolCallFinish({
        event: createMockSuccessEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'getWeather',
            input: {},
          },
          durationMs: 120,
        }),
        callbacks: ev => {
          outcomes.push({
            toolName: ev.toolCall.toolName,
            success: ev.success,
            durationMs: ev.durationMs,
          });
        },
      });

      await notifyOnToolCallFinish({
        event: createMockErrorEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'sendEmail',
            input: {},
          },
          durationMs: 500,
        }),
        callbacks: ev => {
          outcomes.push({
            toolName: ev.toolCall.toolName,
            success: ev.success,
            durationMs: ev.durationMs,
          });
        },
      });

      await notifyOnToolCallFinish({
        event: createMockSuccessEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-3',
            toolName: 'saveFile',
            input: {},
          },
          durationMs: 45,
        }),
        callbacks: ev => {
          outcomes.push({
            toolName: ev.toolCall.toolName,
            success: ev.success,
            durationMs: ev.durationMs,
          });
        },
      });

      expect(outcomes).toMatchInlineSnapshot(`
        [
          {
            "durationMs": 120,
            "success": true,
            "toolName": "getWeather",
          },
          {
            "durationMs": 500,
            "success": false,
            "toolName": "sendEmail",
          },
          {
            "durationMs": 45,
            "success": true,
            "toolName": "saveFile",
          },
        ]
      `);
    });
  });

  describe('notifyOnToolCallFinish - context and metadata', () => {
    it('should propagate step and model context', async () => {
      const received: Array<{
        stepNumber: number | undefined;
        provider: string | undefined;
        modelId: string | undefined;
      }> = [];
      const event = createMockSuccessEvent({
        stepNumber: 3,
        model: { provider: 'anthropic', modelId: 'claude-3' },
      });

      await notifyOnToolCallFinish({
        event,
        callbacks: ev => {
          received.push({
            stepNumber: ev.stepNumber,
            provider: ev.model?.provider,
            modelId: ev.model?.modelId,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "modelId": "claude-3",
            "provider": "anthropic",
            "stepNumber": 3,
          },
        ]
      `);
    });

    it('should propagate telemetry metadata', async () => {
      const received: Array<{
        functionId: string | undefined;
        metadata: Record<string, unknown> | undefined;
      }> = [];
      const event = createMockSuccessEvent({
        functionId: 'tool-executor',
        metadata: {
          traceId: 'trace-abc',
          spanId: 'span-xyz',
        },
      });

      await notifyOnToolCallFinish({
        event,
        callbacks: ev => {
          received.push({
            functionId: ev.functionId,
            metadata: ev.metadata,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "functionId": "tool-executor",
            "metadata": {
              "spanId": "span-xyz",
              "traceId": "trace-abc",
            },
          },
        ]
      `);
    });
  });
});
