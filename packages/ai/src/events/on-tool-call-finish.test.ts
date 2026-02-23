import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  listenOnToolCallFinish,
  notifyOnToolCallFinish,
} from './on-tool-call-finish';
import type { OnToolCallFinishEvent } from '../generate-text/callback-events';

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
  let unsubscribers: Array<() => void>;

  beforeEach(() => {
    unsubscribers = [];
  });

  afterEach(() => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  });

  describe('listenOnToolCallFinish', () => {
    it('should register a listener and return an unsubscribe function', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnToolCallFinish(() => {
        calls.push('listener called');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(createMockSuccessEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener called",
        ]
      `);
    });

    it('should allow multiple listeners to be registered', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnToolCallFinish(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnToolCallFinish(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnToolCallFinish(createMockSuccessEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);
    });

    it('should remove listener when unsubscribe is called', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnToolCallFinish(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnToolCallFinish(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnToolCallFinish(createMockSuccessEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);

      calls.length = 0;
      unsubscribe1();

      await notifyOnToolCallFinish(createMockSuccessEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 2",
        ]
      `);
    });
  });

  describe('notifyOnToolCallFinish - success events', () => {
    it('should propagate successful tool call output', async () => {
      const receivedOutputs: Array<{
        success: boolean;
        output: unknown;
        toolName: string;
      }> = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        if (event.success) {
          receivedOutputs.push({
            success: event.success,
            output: event.output,
            toolName: event.toolCall.toolName,
          });
        }
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockSuccessEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-123',
            toolName: 'getWeather',
            input: { location: 'NYC' },
          },
          output: { temperature: 72, condition: 'sunny' },
        }),
      );

      expect(receivedOutputs).toMatchInlineSnapshot(`
        [
          {
            "output": {
              "condition": "sunny",
              "temperature": 72,
            },
            "success": true,
            "toolName": "getWeather",
          },
        ]
      `);
    });

    it('should propagate execution duration for successful calls', async () => {
      const receivedTimings: Array<{
        toolName: string;
        durationMs: number;
        success: boolean;
      }> = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        receivedTimings.push({
          toolName: event.toolCall.toolName,
          durationMs: event.durationMs,
          success: event.success,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockSuccessEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-fast',
            toolName: 'quickLookup',
            input: {},
          },
          durationMs: 15,
        }),
      );

      await notifyOnToolCallFinish(
        createMockSuccessEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-slow',
            toolName: 'heavyComputation',
            input: {},
          },
          durationMs: 5000,
        }),
      );

      expect(receivedTimings).toMatchInlineSnapshot(`
        [
          {
            "durationMs": 15,
            "success": true,
            "toolName": "quickLookup",
          },
          {
            "durationMs": 5000,
            "success": true,
            "toolName": "heavyComputation",
          },
        ]
      `);
    });
  });

  describe('notifyOnToolCallFinish - error events', () => {
    it('should propagate failed tool call with error', async () => {
      const receivedErrors: Array<{
        success: boolean;
        errorMessage: string;
        toolName: string;
      }> = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        if (!event.success) {
          receivedErrors.push({
            success: event.success,
            errorMessage:
              event.error instanceof Error
                ? event.error.message
                : String(event.error),
            toolName: event.toolCall.toolName,
          });
        }
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockErrorEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-fail',
            toolName: 'riskyOperation',
            input: { dangerous: true },
          },
          error: new Error('Network timeout'),
        }),
      );

      expect(receivedErrors).toMatchInlineSnapshot(`
        [
          {
            "errorMessage": "Network timeout",
            "success": false,
            "toolName": "riskyOperation",
          },
        ]
      `);
    });

    it('should propagate execution duration for failed calls', async () => {
      const receivedTimings: Array<{
        toolName: string;
        durationMs: number;
        success: boolean;
      }> = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        receivedTimings.push({
          toolName: event.toolCall.toolName,
          durationMs: event.durationMs,
          success: event.success,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockErrorEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-timeout',
            toolName: 'slowApi',
            input: {},
          },
          durationMs: 30000,
        }),
      );

      expect(receivedTimings).toMatchInlineSnapshot(`
        [
          {
            "durationMs": 30000,
            "success": false,
            "toolName": "slowApi",
          },
        ]
      `);
    });

    it('should handle non-Error error objects', async () => {
      const receivedErrors: Array<{
        success: boolean;
        error: unknown;
      }> = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        if (!event.success) {
          receivedErrors.push({
            success: event.success,
            error: event.error,
          });
        }
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockErrorEvent({
          error: { code: 'RATE_LIMITED', retryAfter: 60 },
        }),
      );

      expect(receivedErrors).toMatchInlineSnapshot(`
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

  describe('notifyOnToolCallFinish - callbacks', () => {
    it('should call the optional callback after listeners', async () => {
      const callOrder: string[] = [];

      const unsubscribe = listenOnToolCallFinish(() => {
        callOrder.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(createMockSuccessEvent(), () => {
        callOrder.push('callback');
      });

      expect(callOrder).toMatchInlineSnapshot(`
        [
          "listener",
          "callback",
        ]
      `);
    });

    it('should catch errors in listeners without breaking', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnToolCallFinish(() => {
        calls.push('listener 1 before throw');
        throw new Error('listener 1 error');
      });
      const unsubscribe2 = listenOnToolCallFinish(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnToolCallFinish(createMockSuccessEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1 before throw",
          "listener 2",
        ]
      `);
    });

    it('should catch errors in callback without breaking', async () => {
      const calls: string[] = [];

      await notifyOnToolCallFinish(createMockSuccessEvent(), () => {
        calls.push('callback before throw');
        throw new Error('callback error');
      });

      calls.push('after notifyOnToolCallFinish');

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback before throw",
          "after notifyOnToolCallFinish",
        ]
      `);
    });
  });

  describe('tool call finish specific scenarios', () => {
    it('should track success and error outcomes in sequence', async () => {
      const outcomes: Array<{
        toolName: string;
        success: boolean;
        durationMs: number;
      }> = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        outcomes.push({
          toolName: event.toolCall.toolName,
          success: event.success,
          durationMs: event.durationMs,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockSuccessEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'getWeather',
            input: {},
          },
          durationMs: 120,
        }),
      );

      await notifyOnToolCallFinish(
        createMockErrorEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'sendEmail',
            input: {},
          },
          durationMs: 500,
        }),
      );

      await notifyOnToolCallFinish(
        createMockSuccessEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-3',
            toolName: 'saveFile',
            input: {},
          },
          durationMs: 45,
        }),
      );

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

    it('should propagate complex output structures', async () => {
      const receivedOutputs: Array<unknown> = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        if (event.success) {
          receivedOutputs.push(event.output);
        }
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockSuccessEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-complex',
            toolName: 'searchDatabase',
            input: { query: 'SELECT *' },
          },
          output: {
            rows: [
              { id: 1, name: 'Alice', metadata: { role: 'admin' } },
              { id: 2, name: 'Bob', metadata: { role: 'user' } },
            ],
            totalCount: 2,
            hasMore: false,
          },
        }),
      );

      expect(receivedOutputs).toMatchInlineSnapshot(`
        [
          {
            "hasMore": false,
            "rows": [
              {
                "id": 1,
                "metadata": {
                  "role": "admin",
                },
                "name": "Alice",
              },
              {
                "id": 2,
                "metadata": {
                  "role": "user",
                },
                "name": "Bob",
              },
            ],
            "totalCount": 2,
          },
        ]
      `);
    });

    it('should propagate step and model context', async () => {
      const receivedContext: Array<{
        stepNumber: number | undefined;
        provider: string | undefined;
        modelId: string | undefined;
      }> = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        receivedContext.push({
          stepNumber: event.stepNumber,
          provider: event.model?.provider,
          modelId: event.model?.modelId,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockSuccessEvent({
          stepNumber: 3,
          model: { provider: 'anthropic', modelId: 'claude-3' },
        }),
      );

      expect(receivedContext).toMatchInlineSnapshot(`
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
      const receivedMetadata: Array<{
        functionId: string | undefined;
        metadata: Record<string, unknown> | undefined;
      }> = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        receivedMetadata.push({
          functionId: event.functionId,
          metadata: event.metadata,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockSuccessEvent({
          functionId: 'tool-executor',
          metadata: {
            traceId: 'trace-abc',
            spanId: 'span-xyz',
          },
        }),
      );

      expect(receivedMetadata).toMatchInlineSnapshot(`
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

    it('should allow discriminated union type narrowing on success', async () => {
      const successOutputs: unknown[] = [];
      const errorMessages: string[] = [];

      const unsubscribe = listenOnToolCallFinish(event => {
        if (event.success) {
          successOutputs.push(event.output);
        } else {
          errorMessages.push(
            event.error instanceof Error
              ? event.error.message
              : String(event.error),
          );
        }
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallFinish(
        createMockSuccessEvent({ output: 'success result' }),
      );
      await notifyOnToolCallFinish(
        createMockErrorEvent({ error: new Error('failure reason') }),
      );

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
});
