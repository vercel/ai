import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  listenOnToolCallStart,
  notifyOnToolCallStart,
} from './on-tool-call-start';
import type { OnToolCallStartEvent } from '../generate-text/callback-events';

function createMockOnToolCallStartEvent(
  overrides: Partial<OnToolCallStartEvent> = {},
): OnToolCallStartEvent {
  return {
    callId: 'test-call-id',
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
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    ...overrides,
  };
}

describe('on-tool-call-start', () => {
  let unsubscribers: Array<() => void>;

  beforeEach(() => {
    unsubscribers = [];
  });

  afterEach(() => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  });

  describe('listenOnToolCallStart', () => {
    it('should register a listener and return an unsubscribe function', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnToolCallStart(() => {
        calls.push('listener called');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallStart(createMockOnToolCallStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener called",
        ]
      `);
    });

    it('should allow multiple listeners to be registered', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnToolCallStart(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnToolCallStart(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnToolCallStart(createMockOnToolCallStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);
    });

    it('should remove listener when unsubscribe is called', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnToolCallStart(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnToolCallStart(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnToolCallStart(createMockOnToolCallStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);

      calls.length = 0;
      unsubscribe1();

      await notifyOnToolCallStart(createMockOnToolCallStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 2",
        ]
      `);
    });
  });

  describe('notifyOnToolCallStart', () => {
    it('should propagate tool call information to listeners', async () => {
      const receivedToolCalls: Array<{
        toolName: string;
        toolCallId: string;
        input: unknown;
      }> = [];

      const unsubscribe = listenOnToolCallStart(event => {
        receivedToolCalls.push({
          toolName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          input: event.toolCall.input,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallStart(
        createMockOnToolCallStartEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-123',
            toolName: 'getWeather',
            input: { location: 'San Francisco', units: 'fahrenheit' },
          },
        }),
      );

      expect(receivedToolCalls).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "location": "San Francisco",
              "units": "fahrenheit",
            },
            "toolCallId": "call-123",
            "toolName": "getWeather",
          },
        ]
      `);
    });

    it('should propagate step and model context to listeners', async () => {
      const receivedContext: Array<{
        stepNumber: number | undefined;
        provider: string | undefined;
        modelId: string | undefined;
      }> = [];

      const unsubscribe = listenOnToolCallStart(event => {
        receivedContext.push({
          stepNumber: event.stepNumber,
          provider: event.model?.provider,
          modelId: event.model?.modelId,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallStart(
        createMockOnToolCallStartEvent({
          stepNumber: 2,
          model: { provider: 'openai', modelId: 'gpt-4o' },
        }),
      );

      expect(receivedContext).toMatchInlineSnapshot(`
        [
          {
            "modelId": "gpt-4o",
            "provider": "openai",
            "stepNumber": 2,
          },
        ]
      `);
    });

    it('should propagate messages available at tool execution time', async () => {
      const receivedMessages: Array<{
        messageCount: number;
        lastMessageRole: string;
      }> = [];

      const unsubscribe = listenOnToolCallStart(event => {
        const lastMessage = event.messages[event.messages.length - 1];
        receivedMessages.push({
          messageCount: event.messages.length,
          lastMessageRole: lastMessage?.role ?? 'none',
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallStart(
        createMockOnToolCallStartEvent({
          messages: [
            { role: 'user', content: 'What is the weather?' },
            { role: 'assistant', content: 'Let me check that for you.' },
          ],
        }),
      );

      expect(receivedMessages).toMatchInlineSnapshot(`
        [
          {
            "lastMessageRole": "assistant",
            "messageCount": 2,
          },
        ]
      `);
    });

    it('should call the optional callback after listeners', async () => {
      const callOrder: string[] = [];

      const unsubscribe = listenOnToolCallStart(() => {
        callOrder.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallStart(createMockOnToolCallStartEvent(), () => {
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

      const unsubscribe1 = listenOnToolCallStart(() => {
        calls.push('listener 1 before throw');
        throw new Error('listener 1 error');
      });
      const unsubscribe2 = listenOnToolCallStart(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnToolCallStart(createMockOnToolCallStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1 before throw",
          "listener 2",
        ]
      `);
    });

    it('should catch errors in callback without breaking', async () => {
      const calls: string[] = [];

      await notifyOnToolCallStart(createMockOnToolCallStartEvent(), () => {
        calls.push('callback before throw');
        throw new Error('callback error');
      });

      calls.push('after notifyOnToolCallStart');

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback before throw",
          "after notifyOnToolCallStart",
        ]
      `);
    });
  });

  describe('tool call specific scenarios', () => {
    it('should track multiple tool calls in sequence', async () => {
      const toolCallSequence: Array<{
        toolName: string;
        toolCallId: string;
      }> = [];

      const unsubscribe = listenOnToolCallStart(event => {
        toolCallSequence.push({
          toolName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallStart(
        createMockOnToolCallStartEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'getWeather',
            input: { location: 'NYC' },
          },
        }),
      );

      await notifyOnToolCallStart(
        createMockOnToolCallStartEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'getTime',
            input: { timezone: 'EST' },
          },
        }),
      );

      await notifyOnToolCallStart(
        createMockOnToolCallStartEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-3',
            toolName: 'sendEmail',
            input: { to: 'test@example.com', subject: 'Weather Report' },
          },
        }),
      );

      expect(toolCallSequence).toMatchInlineSnapshot(`
        [
          {
            "toolCallId": "call-1",
            "toolName": "getWeather",
          },
          {
            "toolCallId": "call-2",
            "toolName": "getTime",
          },
          {
            "toolCallId": "call-3",
            "toolName": "sendEmail",
          },
        ]
      `);
    });

    it('should propagate complex nested tool input', async () => {
      const receivedInputs: Array<unknown> = [];

      const unsubscribe = listenOnToolCallStart(event => {
        receivedInputs.push(event.toolCall.input);
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallStart(
        createMockOnToolCallStartEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-complex',
            toolName: 'createDocument',
            input: {
              title: 'Report',
              sections: [
                { heading: 'Introduction', content: 'Hello' },
                { heading: 'Body', content: 'Main content' },
              ],
              metadata: {
                author: 'AI',
                tags: ['auto-generated', 'report'],
              },
            },
          },
        }),
      );

      expect(receivedInputs).toMatchInlineSnapshot(`
        [
          {
            "metadata": {
              "author": "AI",
              "tags": [
                "auto-generated",
                "report",
              ],
            },
            "sections": [
              {
                "content": "Hello",
                "heading": "Introduction",
              },
              {
                "content": "Main content",
                "heading": "Body",
              },
            ],
            "title": "Report",
          },
        ]
      `);
    });

    it('should propagate telemetry metadata', async () => {
      const receivedMetadata: Array<{
        functionId: string | undefined;
        metadata: Record<string, unknown> | undefined;
      }> = [];

      const unsubscribe = listenOnToolCallStart(event => {
        receivedMetadata.push({
          functionId: event.functionId,
          metadata: event.metadata,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnToolCallStart(
        createMockOnToolCallStartEvent({
          functionId: 'weather-assistant',
          metadata: {
            userId: 'user-123',
            sessionId: 'session-456',
            requestId: 'req-789',
          },
        }),
      );

      expect(receivedMetadata).toMatchInlineSnapshot(`
        [
          {
            "functionId": "weather-assistant",
            "metadata": {
              "requestId": "req-789",
              "sessionId": "session-456",
              "userId": "user-123",
            },
          },
        ]
      `);
    });
  });
});
