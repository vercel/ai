import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listenOnStepFinish, notifyOnStepFinish } from './on-step-finish';
import type { OnStepFinishEvent } from '../callback-events';
import type { LanguageModelUsage } from '../../types/usage';

function createMockUsage(
  inputTokens: number,
  outputTokens: number,
  totalTokens: number,
): LanguageModelUsage {
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
  };
}

function createMockOnStepFinishEvent(
  overrides: Partial<OnStepFinishEvent> = {},
): OnStepFinishEvent {
  return {
    stepNumber: 0,
    model: { provider: 'test-provider', modelId: 'test-model' },
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    content: [],
    text: '',
    reasoning: [],
    reasoningText: undefined,
    files: [],
    sources: [],
    toolCalls: [],
    staticToolCalls: [],
    dynamicToolCalls: [],
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: 'stop',
    rawFinishReason: 'stop',
    usage: createMockUsage(10, 20, 30),
    warnings: undefined,
    request: {
      body: '{}',
    },
    response: {
      id: 'test-response-id',
      timestamp: new Date(),
      modelId: 'test-model',
      headers: {},
      body: {},
      messages: [],
    },
    providerMetadata: undefined,
    ...overrides,
  };
}

describe('on-step-finish', () => {
  let unsubscribers: Array<() => void>;

  beforeEach(() => {
    unsubscribers = [];
  });

  afterEach(() => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  });

  describe('listenOnStepFinish', () => {
    it('should register a listener and return an unsubscribe function', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnStepFinish(() => {
        calls.push('listener called');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(createMockOnStepFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener called",
        ]
      `);
    });

    it('should allow multiple listeners to be registered', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnStepFinish(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnStepFinish(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnStepFinish(createMockOnStepFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);
    });

    it('should remove listener when unsubscribe is called', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnStepFinish(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnStepFinish(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnStepFinish(createMockOnStepFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);

      calls.length = 0;
      unsubscribe1();

      await notifyOnStepFinish(createMockOnStepFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 2",
        ]
      `);
    });
  });

  describe('notifyOnStepFinish - step result data', () => {
    it('should propagate finish reason and usage to listeners', async () => {
      const receivedResults: Array<{
        finishReason: string;
        inputTokens: number | undefined;
        outputTokens: number | undefined;
        totalTokens: number | undefined;
      }> = [];

      const unsubscribe = listenOnStepFinish(event => {
        receivedResults.push({
          finishReason: event.finishReason,
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          totalTokens: event.usage.totalTokens,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          finishReason: 'tool-calls',
          usage: createMockUsage(150, 75, 225),
        }),
      );

      expect(receivedResults).toMatchInlineSnapshot(`
        [
          {
            "finishReason": "tool-calls",
            "inputTokens": 150,
            "outputTokens": 75,
            "totalTokens": 225,
          },
        ]
      `);
    });

    it('should propagate generated text to listeners', async () => {
      const receivedTexts: Array<{
        stepNumber: number;
        text: string;
      }> = [];

      const unsubscribe = listenOnStepFinish(event => {
        receivedTexts.push({
          stepNumber: event.stepNumber,
          text: event.text,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          stepNumber: 0,
          text: 'The weather in San Francisco is sunny and 72°F.',
        }),
      );

      expect(receivedTexts).toMatchInlineSnapshot(`
        [
          {
            "stepNumber": 0,
            "text": "The weather in San Francisco is sunny and 72°F.",
          },
        ]
      `);
    });

    it('should propagate model information to listeners', async () => {
      const receivedModels: Array<{
        provider: string;
        modelId: string;
      }> = [];

      const unsubscribe = listenOnStepFinish(event => {
        receivedModels.push({
          provider: event.model.provider,
          modelId: event.model.modelId,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          model: { provider: 'openai', modelId: 'gpt-4o' },
        }),
      );

      expect(receivedModels).toMatchInlineSnapshot(`
        [
          {
            "modelId": "gpt-4o",
            "provider": "openai",
          },
        ]
      `);
    });

    it('should propagate tool calls to listeners', async () => {
      const receivedToolCalls: Array<{
        stepNumber: number;
        toolCallCount: number;
        toolNames: string[];
      }> = [];

      const unsubscribe = listenOnStepFinish(event => {
        receivedToolCalls.push({
          stepNumber: event.stepNumber,
          toolCallCount: event.toolCalls.length,
          toolNames: event.toolCalls.map(tc => tc.toolName),
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          stepNumber: 1,
          finishReason: 'tool-calls',
          toolCalls: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'getWeather',
              input: { location: 'NYC' },
            },
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'getTime',
              input: { timezone: 'EST' },
            },
          ],
        }),
      );

      expect(receivedToolCalls).toMatchInlineSnapshot(`
        [
          {
            "stepNumber": 1,
            "toolCallCount": 2,
            "toolNames": [
              "getWeather",
              "getTime",
            ],
          },
        ]
      `);
    });

    it('should propagate tool results to listeners', async () => {
      const receivedToolResults: Array<{
        stepNumber: number;
        resultCount: number;
        toolNames: string[];
      }> = [];

      const unsubscribe = listenOnStepFinish(event => {
        receivedToolResults.push({
          stepNumber: event.stepNumber,
          resultCount: event.toolResults.length,
          toolNames: event.toolResults.map(tr => tr.toolName),
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          stepNumber: 2,
          toolResults: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'getWeather',
              input: { location: 'NYC' },
              output: { temperature: 72 },
            },
          ],
        }),
      );

      expect(receivedToolResults).toMatchInlineSnapshot(`
        [
          {
            "resultCount": 1,
            "stepNumber": 2,
            "toolNames": [
              "getWeather",
            ],
          },
        ]
      `);
    });
  });

  describe('notifyOnStepFinish - callbacks', () => {
    it('should call the optional callback after listeners', async () => {
      const callOrder: string[] = [];

      const unsubscribe = listenOnStepFinish(() => {
        callOrder.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(createMockOnStepFinishEvent(), () => {
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

      const unsubscribe1 = listenOnStepFinish(() => {
        calls.push('listener 1 before throw');
        throw new Error('listener 1 error');
      });
      const unsubscribe2 = listenOnStepFinish(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnStepFinish(createMockOnStepFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1 before throw",
          "listener 2",
        ]
      `);
    });

    it('should catch errors in callback without breaking', async () => {
      const calls: string[] = [];

      await notifyOnStepFinish(createMockOnStepFinishEvent(), () => {
        calls.push('callback before throw');
        throw new Error('callback error');
      });

      calls.push('after notifyOnStepFinish');

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback before throw",
          "after notifyOnStepFinish",
        ]
      `);
    });
  });

  describe('step finish specific scenarios', () => {
    it('should track multiple steps in sequence', async () => {
      const stepResults: Array<{
        stepNumber: number;
        finishReason: string;
        inputTokens: number | undefined;
        outputTokens: number | undefined;
      }> = [];

      const unsubscribe = listenOnStepFinish(event => {
        stepResults.push({
          stepNumber: event.stepNumber,
          finishReason: event.finishReason,
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          stepNumber: 0,
          finishReason: 'tool-calls',
          usage: createMockUsage(100, 50, 150),
        }),
      );

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          stepNumber: 1,
          finishReason: 'tool-calls',
          usage: createMockUsage(200, 75, 275),
        }),
      );

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          stepNumber: 2,
          finishReason: 'stop',
          usage: createMockUsage(300, 100, 400),
        }),
      );

      expect(stepResults).toMatchInlineSnapshot(`
        [
          {
            "finishReason": "tool-calls",
            "inputTokens": 100,
            "outputTokens": 50,
            "stepNumber": 0,
          },
          {
            "finishReason": "tool-calls",
            "inputTokens": 200,
            "outputTokens": 75,
            "stepNumber": 1,
          },
          {
            "finishReason": "stop",
            "inputTokens": 300,
            "outputTokens": 100,
            "stepNumber": 2,
          },
        ]
      `);
    });

    it('should calculate cumulative token usage across steps', async () => {
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const unsubscribe = listenOnStepFinish(event => {
        totalInputTokens += event.usage.inputTokens ?? 0;
        totalOutputTokens += event.usage.outputTokens ?? 0;
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          usage: createMockUsage(100, 50, 150),
        }),
      );

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          usage: createMockUsage(150, 75, 225),
        }),
      );

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          usage: createMockUsage(200, 100, 300),
        }),
      );

      expect({ totalInputTokens, totalOutputTokens }).toMatchInlineSnapshot(`
        {
          "totalInputTokens": 450,
          "totalOutputTokens": 225,
        }
      `);
    });

    it('should propagate different finish reasons', async () => {
      const finishReasons: string[] = [];

      const unsubscribe = listenOnStepFinish(event => {
        finishReasons.push(event.finishReason);
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({ finishReason: 'stop' }),
      );
      await notifyOnStepFinish(
        createMockOnStepFinishEvent({ finishReason: 'tool-calls' }),
      );
      await notifyOnStepFinish(
        createMockOnStepFinishEvent({ finishReason: 'length' }),
      );
      await notifyOnStepFinish(
        createMockOnStepFinishEvent({ finishReason: 'content-filter' }),
      );
      await notifyOnStepFinish(
        createMockOnStepFinishEvent({ finishReason: 'error' }),
      );

      expect(finishReasons).toMatchInlineSnapshot(`
        [
          "stop",
          "tool-calls",
          "length",
          "content-filter",
          "error",
        ]
      `);
    });

    it('should propagate response metadata', async () => {
      const receivedMetadata: Array<{
        responseId: string | undefined;
        modelId: string | undefined;
      }> = [];

      const unsubscribe = listenOnStepFinish(event => {
        receivedMetadata.push({
          responseId: event.response.id,
          modelId: event.response.modelId,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          response: {
            id: 'chatcmpl-abc123',
            timestamp: new Date('2024-01-01'),
            modelId: 'gpt-4o-2024-05-13',
            headers: { 'x-request-id': 'req-xyz' },
            body: {},
            messages: [],
          },
        }),
      );

      expect(receivedMetadata).toMatchInlineSnapshot(`
        [
          {
            "modelId": "gpt-4o-2024-05-13",
            "responseId": "chatcmpl-abc123",
          },
        ]
      `);
    });

    it('should propagate telemetry metadata', async () => {
      const receivedTelemetry: Array<{
        functionId: string | undefined;
        metadata: Record<string, unknown> | undefined;
      }> = [];

      const unsubscribe = listenOnStepFinish(event => {
        receivedTelemetry.push({
          functionId: event.functionId,
          metadata: event.metadata,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepFinish(
        createMockOnStepFinishEvent({
          functionId: 'chat-completion',
          metadata: {
            conversationId: 'conv-123',
            userId: 'user-456',
          },
        }),
      );

      expect(receivedTelemetry).toMatchInlineSnapshot(`
        [
          {
            "functionId": "chat-completion",
            "metadata": {
              "conversationId": "conv-123",
              "userId": "user-456",
            },
          },
        ]
      `);
    });
  });
});
