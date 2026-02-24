import { describe, it, expect } from 'vitest';
import { notifyOnStepFinish } from './on-step-finish';
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

describe('on-step-finish', () => {
  describe('notifyOnStepFinish - callbacks', () => {
    it('should call a single callback', async () => {
      const calls: string[] = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent(),
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

    it('should call multiple callbacks when passed as array', async () => {
      const calls: string[] = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent(),
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
      await expect(
        notifyOnStepFinish({
          event: createMockOnStepFinishEvent(),
          callbacks: undefined,
        }),
      ).resolves.toBeUndefined();
    });

    it('should handle omitted callbacks', async () => {
      await expect(
        notifyOnStepFinish({
          event: createMockOnStepFinishEvent(),
        }),
      ).resolves.toBeUndefined();
    });

    it('should await async callbacks', async () => {
      const callOrder: string[] = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent(),
        callbacks: async () => {
          callOrder.push('before await');
          await Promise.resolve();
          callOrder.push('after await');
        },
      });

      expect(callOrder).toMatchInlineSnapshot(`
        [
          "before await",
          "after await",
        ]
      `);
    });

    it('should swallow errors in callbacks without breaking', async () => {
      const calls: string[] = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent(),
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
  });

  describe('notifyOnStepFinish - event data propagation', () => {
    it('should propagate finish reason and usage to callbacks', async () => {
      const received: Array<{
        finishReason: string;
        inputTokens: number | undefined;
        outputTokens: number | undefined;
        totalTokens: number | undefined;
      }> = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          finishReason: 'tool-calls',
          usage: createMockUsage(150, 75, 225),
        }),
        callbacks: event => {
          received.push({
            finishReason: event.finishReason,
            inputTokens: event.usage.inputTokens,
            outputTokens: event.usage.outputTokens,
            totalTokens: event.usage.totalTokens,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
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

    it('should propagate generated text to callbacks', async () => {
      const received: Array<{ stepNumber: number; text: string }> = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          stepNumber: 0,
          text: 'The weather in San Francisco is sunny and 72°F.',
        }),
        callbacks: event => {
          received.push({
            stepNumber: event.stepNumber,
            text: event.text,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "stepNumber": 0,
            "text": "The weather in San Francisco is sunny and 72°F.",
          },
        ]
      `);
    });

    it('should propagate model information to callbacks', async () => {
      const received: Array<{ provider: string; modelId: string }> = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          model: { provider: 'openai', modelId: 'gpt-4o' },
        }),
        callbacks: event => {
          received.push({
            provider: event.model.provider,
            modelId: event.model.modelId,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "modelId": "gpt-4o",
            "provider": "openai",
          },
        ]
      `);
    });

    it('should propagate tool calls to callbacks', async () => {
      const received: Array<{
        stepNumber: number;
        toolCallCount: number;
        toolNames: string[];
      }> = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
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
        callbacks: event => {
          received.push({
            stepNumber: event.stepNumber,
            toolCallCount: event.toolCalls.length,
            toolNames: event.toolCalls.map(tc => tc.toolName),
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
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

    it('should propagate tool results to callbacks', async () => {
      const received: Array<{
        stepNumber: number;
        resultCount: number;
        toolNames: string[];
      }> = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
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
        callbacks: event => {
          received.push({
            stepNumber: event.stepNumber,
            resultCount: event.toolResults.length,
            toolNames: event.toolResults.map(tr => tr.toolName),
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
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

    it('should propagate response metadata to callbacks', async () => {
      const received: Array<{
        responseId: string | undefined;
        modelId: string | undefined;
      }> = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          response: {
            id: 'chatcmpl-abc123',
            timestamp: new Date('2024-01-01'),
            modelId: 'gpt-4o-2024-05-13',
            headers: { 'x-request-id': 'req-xyz' },
            body: {},
            messages: [],
          },
        }),
        callbacks: event => {
          received.push({
            responseId: event.response.id,
            modelId: event.response.modelId,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "modelId": "gpt-4o-2024-05-13",
            "responseId": "chatcmpl-abc123",
          },
        ]
      `);
    });

    it('should propagate telemetry metadata to callbacks', async () => {
      const received: Array<{
        functionId: string | undefined;
        metadata: Record<string, unknown> | undefined;
      }> = [];

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          functionId: 'chat-completion',
          metadata: {
            conversationId: 'conv-123',
            userId: 'user-456',
          },
        }),
        callbacks: event => {
          received.push({
            functionId: event.functionId,
            metadata: event.metadata,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
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

  describe('notifyOnStepFinish - multi-step and finish reasons', () => {
    it('should track multiple steps in sequence', async () => {
      const stepResults: Array<{
        stepNumber: number;
        finishReason: string;
        inputTokens: number | undefined;
        outputTokens: number | undefined;
      }> = [];

      const callback = (event: OnStepFinishEvent) => {
        stepResults.push({
          stepNumber: event.stepNumber,
          finishReason: event.finishReason,
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
        });
      };

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          stepNumber: 0,
          finishReason: 'tool-calls',
          usage: createMockUsage(100, 50, 150),
        }),
        callbacks: callback,
      });

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          stepNumber: 1,
          finishReason: 'tool-calls',
          usage: createMockUsage(200, 75, 275),
        }),
        callbacks: callback,
      });

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          stepNumber: 2,
          finishReason: 'stop',
          usage: createMockUsage(300, 100, 400),
        }),
        callbacks: callback,
      });

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

    it('should propagate different finish reasons', async () => {
      const finishReasons: string[] = [];

      const callback = (event: OnStepFinishEvent) => {
        finishReasons.push(event.finishReason);
      };

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({ finishReason: 'stop' }),
        callbacks: callback,
      });
      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({ finishReason: 'tool-calls' }),
        callbacks: callback,
      });
      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({ finishReason: 'length' }),
        callbacks: callback,
      });
      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({ finishReason: 'content-filter' }),
        callbacks: callback,
      });
      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({ finishReason: 'error' }),
        callbacks: callback,
      });

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

    it('should calculate cumulative token usage across steps', async () => {
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const callback = (event: OnStepFinishEvent) => {
        totalInputTokens += event.usage.inputTokens ?? 0;
        totalOutputTokens += event.usage.outputTokens ?? 0;
      };

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          usage: createMockUsage(100, 50, 150),
        }),
        callbacks: callback,
      });

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          usage: createMockUsage(150, 75, 225),
        }),
        callbacks: callback,
      });

      await notifyOnStepFinish({
        event: createMockOnStepFinishEvent({
          usage: createMockUsage(200, 100, 300),
        }),
        callbacks: callback,
      });

      expect({ totalInputTokens, totalOutputTokens }).toMatchInlineSnapshot(`
        {
          "totalInputTokens": 450,
          "totalOutputTokens": 225,
        }
      `);
    });
  });
});
