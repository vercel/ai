import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listenOnFinish, notifyOnFinish } from './on-finish';
import type { OnFinishEvent } from '../generate-text/callback-events';
import type { LanguageModelUsage } from '../types/usage';
import type { StepResult } from '../generate-text/step-result';
import type { ToolSet } from '../generate-text/tool-set';

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

function createMockStepResult(
  overrides: Partial<StepResult<ToolSet>> = {},
): StepResult<ToolSet> {
  return {
    callId: 'test-call-id',
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
    request: { body: '{}' },
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

function createMockOnFinishEvent(
  overrides: Partial<OnFinishEvent> = {},
): OnFinishEvent {
  const stepResult = createMockStepResult();
  return {
    ...stepResult,
    steps: [stepResult],
    totalUsage: createMockUsage(10, 20, 30),
    ...overrides,
  };
}

describe('on-finish', () => {
  let unsubscribers: Array<() => void>;

  beforeEach(() => {
    unsubscribers = [];
  });

  afterEach(() => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  });

  describe('listenOnFinish', () => {
    it('should register a listener and return an unsubscribe function', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnFinish(() => {
        calls.push('listener called');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(createMockOnFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener called",
        ]
      `);
    });

    it('should allow multiple listeners to be registered', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnFinish(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnFinish(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnFinish(createMockOnFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);
    });

    it('should remove listener when unsubscribe is called', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnFinish(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnFinish(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnFinish(createMockOnFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);

      calls.length = 0;
      unsubscribe1();

      await notifyOnFinish(createMockOnFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 2",
        ]
      `);
    });
  });

  describe('notifyOnFinish - aggregated data', () => {
    it('should propagate total usage across all steps', async () => {
      const receivedUsage: Array<{
        inputTokens: number | undefined;
        outputTokens: number | undefined;
        totalTokens: number | undefined;
      }> = [];

      const unsubscribe = listenOnFinish(event => {
        receivedUsage.push({
          inputTokens: event.totalUsage.inputTokens,
          outputTokens: event.totalUsage.outputTokens,
          totalTokens: event.totalUsage.totalTokens,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(
        createMockOnFinishEvent({
          totalUsage: createMockUsage(500, 250, 750),
        }),
      );

      expect(receivedUsage).toMatchInlineSnapshot(`
        [
          {
            "inputTokens": 500,
            "outputTokens": 250,
            "totalTokens": 750,
          },
        ]
      `);
    });

    it('should propagate all steps in the generation', async () => {
      const receivedSteps: Array<{
        stepCount: number;
        stepNumbers: number[];
        finishReasons: string[];
      }> = [];

      const unsubscribe = listenOnFinish(event => {
        receivedSteps.push({
          stepCount: event.steps.length,
          stepNumbers: event.steps.map(s => s.stepNumber),
          finishReasons: event.steps.map(s => s.finishReason),
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(
        createMockOnFinishEvent({
          steps: [
            createMockStepResult({
              stepNumber: 0,
              finishReason: 'tool-calls',
            }),
            createMockStepResult({
              stepNumber: 1,
              finishReason: 'tool-calls',
            }),
            createMockStepResult({
              stepNumber: 2,
              finishReason: 'stop',
            }),
          ],
        }),
      );

      expect(receivedSteps).toMatchInlineSnapshot(`
        [
          {
            "finishReasons": [
              "tool-calls",
              "tool-calls",
              "stop",
            ],
            "stepCount": 3,
            "stepNumbers": [
              0,
              1,
              2,
            ],
          },
        ]
      `);
    });

    it('should propagate final text from the generation', async () => {
      const receivedTexts: Array<{
        text: string;
        stepCount: number;
      }> = [];

      const unsubscribe = listenOnFinish(event => {
        receivedTexts.push({
          text: event.text,
          stepCount: event.steps.length,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(
        createMockOnFinishEvent({
          text: 'The weather in San Francisco is sunny with a high of 72°F.',
          steps: [
            createMockStepResult({ stepNumber: 0, finishReason: 'tool-calls' }),
            createMockStepResult({
              stepNumber: 1,
              text: 'The weather in San Francisco is sunny with a high of 72°F.',
              finishReason: 'stop',
            }),
          ],
        }),
      );

      expect(receivedTexts).toMatchInlineSnapshot(`
        [
          {
            "stepCount": 2,
            "text": "The weather in San Francisco is sunny with a high of 72°F.",
          },
        ]
      `);
    });

    it('should propagate model information', async () => {
      const receivedModels: Array<{
        provider: string;
        modelId: string;
      }> = [];

      const unsubscribe = listenOnFinish(event => {
        receivedModels.push({
          provider: event.model.provider,
          modelId: event.model.modelId,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(
        createMockOnFinishEvent({
          model: { provider: 'anthropic', modelId: 'claude-3-opus' },
        }),
      );

      expect(receivedModels).toMatchInlineSnapshot(`
        [
          {
            "modelId": "claude-3-opus",
            "provider": "anthropic",
          },
        ]
      `);
    });
  });

  describe('notifyOnFinish - callbacks', () => {
    it('should call the optional callback after listeners', async () => {
      const callOrder: string[] = [];

      const unsubscribe = listenOnFinish(() => {
        callOrder.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(createMockOnFinishEvent(), () => {
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

      const unsubscribe1 = listenOnFinish(() => {
        calls.push('listener 1 before throw');
        throw new Error('listener 1 error');
      });
      const unsubscribe2 = listenOnFinish(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnFinish(createMockOnFinishEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1 before throw",
          "listener 2",
        ]
      `);
    });

    it('should catch errors in callback without breaking', async () => {
      const calls: string[] = [];

      await notifyOnFinish(createMockOnFinishEvent(), () => {
        calls.push('callback before throw');
        throw new Error('callback error');
      });

      calls.push('after notifyOnFinish');

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback before throw",
          "after notifyOnFinish",
        ]
      `);
    });
  });

  describe('finish specific scenarios', () => {
    it('should propagate per-step usage for analysis', async () => {
      const perStepUsage: Array<{
        stepNumber: number;
        inputTokens: number | undefined;
        outputTokens: number | undefined;
      }> = [];

      const unsubscribe = listenOnFinish(event => {
        for (const step of event.steps) {
          perStepUsage.push({
            stepNumber: step.stepNumber,
            inputTokens: step.usage.inputTokens,
            outputTokens: step.usage.outputTokens,
          });
        }
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(
        createMockOnFinishEvent({
          steps: [
            createMockStepResult({
              stepNumber: 0,
              usage: createMockUsage(100, 50, 150),
            }),
            createMockStepResult({
              stepNumber: 1,
              usage: createMockUsage(150, 75, 225),
            }),
            createMockStepResult({
              stepNumber: 2,
              usage: createMockUsage(200, 100, 300),
            }),
          ],
          totalUsage: createMockUsage(450, 225, 675),
        }),
      );

      expect(perStepUsage).toMatchInlineSnapshot(`
        [
          {
            "inputTokens": 100,
            "outputTokens": 50,
            "stepNumber": 0,
          },
          {
            "inputTokens": 150,
            "outputTokens": 75,
            "stepNumber": 1,
          },
          {
            "inputTokens": 200,
            "outputTokens": 100,
            "stepNumber": 2,
          },
        ]
      `);
    });

    it('should propagate tool calls from all steps', async () => {
      const allToolCalls: Array<{
        stepNumber: number;
        toolNames: string[];
      }> = [];

      const unsubscribe = listenOnFinish(event => {
        for (const step of event.steps) {
          if (step.toolCalls.length > 0) {
            allToolCalls.push({
              stepNumber: step.stepNumber,
              toolNames: step.toolCalls.map(tc => tc.toolName),
            });
          }
        }
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(
        createMockOnFinishEvent({
          steps: [
            createMockStepResult({
              stepNumber: 0,
              finishReason: 'tool-calls',
              toolCalls: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'getWeather',
                  input: { location: 'NYC' },
                },
              ],
            }),
            createMockStepResult({
              stepNumber: 1,
              finishReason: 'tool-calls',
              toolCalls: [
                {
                  type: 'tool-call',
                  toolCallId: 'call-2',
                  toolName: 'sendEmail',
                  input: { to: 'test@example.com' },
                },
              ],
            }),
            createMockStepResult({
              stepNumber: 2,
              finishReason: 'stop',
              toolCalls: [],
            }),
          ],
        }),
      );

      expect(allToolCalls).toMatchInlineSnapshot(`
        [
          {
            "stepNumber": 0,
            "toolNames": [
              "getWeather",
            ],
          },
          {
            "stepNumber": 1,
            "toolNames": [
              "sendEmail",
            ],
          },
        ]
      `);
    });

    it('should propagate telemetry metadata', async () => {
      const receivedTelemetry: Array<{
        functionId: string | undefined;
        metadata: Record<string, unknown> | undefined;
      }> = [];

      const unsubscribe = listenOnFinish(event => {
        receivedTelemetry.push({
          functionId: event.functionId,
          metadata: event.metadata,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(
        createMockOnFinishEvent({
          functionId: 'chat-assistant',
          metadata: {
            sessionId: 'session-123',
            requestId: 'req-456',
          },
        }),
      );

      expect(receivedTelemetry).toMatchInlineSnapshot(`
        [
          {
            "functionId": "chat-assistant",
            "metadata": {
              "requestId": "req-456",
              "sessionId": "session-123",
            },
          },
        ]
      `);
    });

    it('should handle single-step generation', async () => {
      const received: Array<{
        stepCount: number;
        finishReason: string;
        text: string;
      }> = [];

      const unsubscribe = listenOnFinish(event => {
        received.push({
          stepCount: event.steps.length,
          finishReason: event.finishReason,
          text: event.text,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnFinish(
        createMockOnFinishEvent({
          text: 'Hello, world!',
          finishReason: 'stop',
          steps: [
            createMockStepResult({
              stepNumber: 0,
              text: 'Hello, world!',
              finishReason: 'stop',
            }),
          ],
        }),
      );

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "finishReason": "stop",
            "stepCount": 1,
            "text": "Hello, world!",
          },
        ]
      `);
    });
  });
});
