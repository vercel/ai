import { describe, it, expect } from 'vitest';
import { notifyOnToolCallStart } from './on-tool-call-start';
import type { OnToolCallStartListener } from './on-tool-call-start';
import type { OnToolCallStartEvent } from '../callback-events';

function createMockOnToolCallStartEvent(
  overrides: Partial<OnToolCallStartEvent> = {},
): OnToolCallStartEvent {
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
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    ...overrides,
  };
}

describe('on-tool-call-start', () => {
  describe('notifyOnToolCallStart', () => {
    it('should call a single callback with the event', async () => {
      const calls: string[] = [];

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent(),
        callbacks: () => {
          calls.push('callback called');
        },
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback called",
        ]
      `);
    });

    it('should call all callbacks when given an array', async () => {
      const calls: string[] = [];

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent(),
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

    it('should handle undefined callbacks gracefully', async () => {
      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent(),
        callbacks: undefined,
      });
    });

    it('should handle omitted callbacks gracefully', async () => {
      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent(),
      });
    });

    it('should propagate tool call information to callbacks', async () => {
      const receivedToolCalls: Array<{
        toolName: string;
        toolCallId: string;
        input: unknown;
      }> = [];

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-123',
            toolName: 'getWeather',
            input: { location: 'San Francisco', units: 'fahrenheit' },
          },
        }),
        callbacks: event => {
          receivedToolCalls.push({
            toolName: event.toolCall.toolName,
            toolCallId: event.toolCall.toolCallId,
            input: event.toolCall.input,
          });
        },
      });

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

    it('should propagate step and model context to callbacks', async () => {
      const receivedContext: Array<{
        stepNumber: number | undefined;
        provider: string | undefined;
        modelId: string | undefined;
      }> = [];

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent({
          stepNumber: 2,
          model: { provider: 'openai', modelId: 'gpt-4o' },
        }),
        callbacks: event => {
          receivedContext.push({
            stepNumber: event.stepNumber,
            provider: event.model?.provider,
            modelId: event.model?.modelId,
          });
        },
      });

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

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent({
          messages: [
            { role: 'user', content: 'What is the weather?' },
            { role: 'assistant', content: 'Let me check that for you.' },
          ],
        }),
        callbacks: event => {
          const lastMessage = event.messages[event.messages.length - 1];
          receivedMessages.push({
            messageCount: event.messages.length,
            lastMessageRole: lastMessage?.role ?? 'none',
          });
        },
      });

      expect(receivedMessages).toMatchInlineSnapshot(`
        [
          {
            "lastMessageRole": "assistant",
            "messageCount": 2,
          },
        ]
      `);
    });

    it('should catch errors in callbacks without breaking', async () => {
      const calls: string[] = [];

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent(),
        callbacks: [
          () => {
            calls.push('callback 1 before throw');
            throw new Error('callback 1 error');
          },
          () => {
            calls.push('callback 2');
          },
        ],
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback 1 before throw",
          "callback 2",
        ]
      `);
    });

    it('should catch errors in a single callback without breaking', async () => {
      const calls: string[] = [];

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent(),
        callbacks: () => {
          calls.push('callback before throw');
          throw new Error('callback error');
        },
      });

      calls.push('after notifyOnToolCallStart');

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback before throw",
          "after notifyOnToolCallStart",
        ]
      `);
    });

    it('should support async callbacks', async () => {
      const calls: string[] = [];

      const asyncCallback: OnToolCallStartListener<any> = async event => {
        await new Promise(resolve => setTimeout(resolve, 1));
        calls.push(`async: ${event.toolCall.toolName}`);
      };

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent(),
        callbacks: asyncCallback,
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "async: testTool",
        ]
      `);
    });
  });

  describe('tool call specific scenarios', () => {
    it('should handle multiple sequential notifications', async () => {
      const toolCallSequence: Array<{
        toolName: string;
        toolCallId: string;
      }> = [];

      const callback: OnToolCallStartListener<any> = event => {
        toolCallSequence.push({
          toolName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
        });
      };

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'getWeather',
            input: { location: 'NYC' },
          },
        }),
        callbacks: callback,
      });

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'getTime',
            input: { timezone: 'EST' },
          },
        }),
        callbacks: callback,
      });

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent({
          toolCall: {
            type: 'tool-call',
            toolCallId: 'call-3',
            toolName: 'sendEmail',
            input: { to: 'test@example.com', subject: 'Weather Report' },
          },
        }),
        callbacks: callback,
      });

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

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent({
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
        callbacks: event => {
          receivedInputs.push(event.toolCall.input);
        },
      });

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

      await notifyOnToolCallStart({
        event: createMockOnToolCallStartEvent({
          functionId: 'weather-assistant',
          metadata: {
            userId: 'user-123',
            sessionId: 'session-456',
            requestId: 'req-789',
          },
        }),
        callbacks: event => {
          receivedMetadata.push({
            functionId: event.functionId,
            metadata: event.metadata,
          });
        },
      });

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
