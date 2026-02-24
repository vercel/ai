import { describe, it, expect } from 'vitest';
import { notifyOnFinish } from './on-finish';
import type { OnFinishEvent } from '../callback-events';
import type { LanguageModelUsage } from '../../types/usage';
import type { StepResult } from '../step-result';
import type { ToolSet } from '../tool-set';

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
    experimental_context: undefined,
    functionId: undefined,
    metadata: undefined,
    ...overrides,
  };
}

describe('on-finish', () => {
  describe('notifyOnFinish - callbacks', () => {
    it('should call single callback', async () => {
      const calls: string[] = [];
      const event = createMockOnFinishEvent();

      await notifyOnFinish({
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
      const event = createMockOnFinishEvent();

      await notifyOnFinish({
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
      const event = createMockOnFinishEvent();

      await expect(
        notifyOnFinish({ event, callbacks: undefined }),
      ).resolves.toBeUndefined();
    });

    it('should handle omitted callbacks', async () => {
      const event = createMockOnFinishEvent();

      await expect(notifyOnFinish({ event })).resolves.toBeUndefined();
    });

    it('should swallow callback errors and continue', async () => {
      const calls: string[] = [];

      await notifyOnFinish({
        event: createMockOnFinishEvent(),
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

  describe('notifyOnFinish - aggregated data', () => {
    it('should propagate totalUsage', async () => {
      const received: Array<{
        inputTokens: number | undefined;
        outputTokens: number | undefined;
        totalTokens: number | undefined;
      }> = [];
      const event = createMockOnFinishEvent({
        totalUsage: createMockUsage(500, 250, 750),
      });

      await notifyOnFinish({
        event,
        callbacks: ev => {
          received.push({
            inputTokens: ev.totalUsage.inputTokens,
            outputTokens: ev.totalUsage.outputTokens,
            totalTokens: ev.totalUsage.totalTokens,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "inputTokens": 500,
            "outputTokens": 250,
            "totalTokens": 750,
          },
        ]
      `);
    });

    it('should propagate steps array', async () => {
      const received: Array<{
        stepCount: number;
        stepNumbers: number[];
        finishReasons: string[];
      }> = [];
      const event = createMockOnFinishEvent({
        steps: [
          createMockStepResult({ stepNumber: 0, finishReason: 'tool-calls' }),
          createMockStepResult({ stepNumber: 1, finishReason: 'tool-calls' }),
          createMockStepResult({ stepNumber: 2, finishReason: 'stop' }),
        ],
      });

      await notifyOnFinish({
        event,
        callbacks: ev => {
          received.push({
            stepCount: ev.steps.length,
            stepNumbers: ev.steps.map(s => s.stepNumber),
            finishReasons: ev.steps.map(s => s.finishReason),
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
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

    it('should propagate final text', async () => {
      const received: Array<{ text: string; stepCount: number }> = [];
      const event = createMockOnFinishEvent({
        text: 'The weather in San Francisco is sunny with a high of 72°F.',
        steps: [
          createMockStepResult({ stepNumber: 0, finishReason: 'tool-calls' }),
          createMockStepResult({
            stepNumber: 1,
            text: 'The weather in San Francisco is sunny with a high of 72°F.',
            finishReason: 'stop',
          }),
        ],
      });

      await notifyOnFinish({
        event,
        callbacks: ev => {
          received.push({
            text: ev.text,
            stepCount: ev.steps.length,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "stepCount": 2,
            "text": "The weather in San Francisco is sunny with a high of 72°F.",
          },
        ]
      `);
    });

    it('should propagate model info', async () => {
      const received: Array<{ provider: string; modelId: string }> = [];
      const event = createMockOnFinishEvent({
        model: { provider: 'anthropic', modelId: 'claude-3-opus' },
      });

      await notifyOnFinish({
        event,
        callbacks: ev => {
          received.push({
            provider: ev.model.provider,
            modelId: ev.model.modelId,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "modelId": "claude-3-opus",
            "provider": "anthropic",
          },
        ]
      `);
    });
  });

  describe('notifyOnFinish - per-step analysis', () => {
    it('should propagate per-step usage', async () => {
      const perStepUsage: Array<{
        stepNumber: number;
        inputTokens: number | undefined;
        outputTokens: number | undefined;
      }> = [];
      const event = createMockOnFinishEvent({
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
      });

      await notifyOnFinish({
        event,
        callbacks: ev => {
          for (const step of ev.steps) {
            perStepUsage.push({
              stepNumber: step.stepNumber,
              inputTokens: step.usage.inputTokens,
              outputTokens: step.usage.outputTokens,
            });
          }
        },
      });

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
      const allToolCalls: Array<{ stepNumber: number; toolNames: string[] }> =
        [];
      const event = createMockOnFinishEvent({
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
      });

      await notifyOnFinish({
        event,
        callbacks: ev => {
          for (const step of ev.steps) {
            if (step.toolCalls.length > 0) {
              allToolCalls.push({
                stepNumber: step.stepNumber,
                toolNames: step.toolCalls.map(tc => tc.toolName),
              });
            }
          }
        },
      });

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
  });

  describe('notifyOnFinish - telemetry and single-step', () => {
    it('should propagate telemetry metadata', async () => {
      const received: Array<{
        functionId: string | undefined;
        metadata: Record<string, unknown> | undefined;
      }> = [];
      const event = createMockOnFinishEvent({
        functionId: 'chat-assistant',
        metadata: {
          sessionId: 'session-123',
          requestId: 'req-456',
        },
      });

      await notifyOnFinish({
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
      const event = createMockOnFinishEvent({
        text: 'Hello, world!',
        finishReason: 'stop',
        steps: [
          createMockStepResult({
            stepNumber: 0,
            text: 'Hello, world!',
            finishReason: 'stop',
          }),
        ],
      });

      await notifyOnFinish({
        event,
        callbacks: ev => {
          received.push({
            stepCount: ev.steps.length,
            finishReason: ev.finishReason,
            text: ev.text,
          });
        },
      });

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
