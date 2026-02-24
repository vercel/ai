import { describe, it, expect } from 'vitest';
import { notify } from './notify';
import type { Listener } from './notify';
import type {
  OnStartEvent,
  OnStepStartEvent,
  OnToolCallStartEvent,
  OnToolCallFinishEvent,
  OnStepFinishEvent,
  OnFinishEvent,
} from '../generate-text/callback-events';
import type { LanguageModelUsage } from '../types/usage';
import type { StepResult } from '../generate-text/step-result';
import type { ToolSet } from '../generate-text/tool-set';

describe('notify', () => {
  describe('callback invocation', () => {
    it('should call a single callback with the event', async () => {
      const calls: string[] = [];

      await notify({
        event: { value: 'hello' },
        callbacks: event => {
          calls.push(event.value);
        },
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "hello",
        ]
      `);
    });

    it('should call all callbacks when given an array', async () => {
      const calls: string[] = [];

      await notify({
        event: { value: 'hello' },
        callbacks: [
          event => {
            calls.push(`first: ${event.value}`);
          },
          event => {
            calls.push(`second: ${event.value}`);
          },
        ],
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "first: hello",
          "second: hello",
        ]
      `);
    });

    it('should handle undefined callbacks', async () => {
      await notify({ event: { value: 'hello' }, callbacks: undefined });
    });

    it('should handle omitted callbacks', async () => {
      await notify({ event: { value: 'hello' } });
    });
  });

  describe('async support', () => {
    it('should await async callbacks before continuing', async () => {
      const calls: string[] = [];

      await notify({
        event: 'test',
        callbacks: async () => {
          await new Promise(resolve => setTimeout(resolve, 1));
          calls.push('async done');
        },
      });

      calls.push('after notify');

      expect(calls).toMatchInlineSnapshot(`
        [
          "async done",
          "after notify",
        ]
      `);
    });

    it('should await async callbacks sequentially', async () => {
      const calls: string[] = [];

      await notify({
        event: 'test',
        callbacks: [
          async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
            calls.push('slow');
          },
          () => {
            calls.push('fast');
          },
        ],
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "slow",
          "fast",
        ]
      `);
    });
  });

  describe('error handling', () => {
    it('should catch errors in a single callback without breaking', async () => {
      const calls: string[] = [];

      await notify({
        event: 'test',
        callbacks: () => {
          calls.push('before throw');
          throw new Error('callback error');
        },
      });

      calls.push('after notify');

      expect(calls).toMatchInlineSnapshot(`
        [
          "before throw",
          "after notify",
        ]
      `);
    });

    it('should catch errors in array callbacks and continue to next', async () => {
      const calls: string[] = [];

      await notify({
        event: 'test',
        callbacks: [
          () => {
            calls.push('first before throw');
            throw new Error('first error');
          },
          () => {
            calls.push('second runs');
          },
        ],
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "first before throw",
          "second runs",
        ]
      `);
    });

    it('should catch async rejection without breaking', async () => {
      const calls: string[] = [];

      await notify({
        event: 'test',
        callbacks: async () => {
          calls.push('async before reject');
          throw new Error('async error');
        },
      });

      calls.push('after notify');

      expect(calls).toMatchInlineSnapshot(`
        [
          "async before reject",
          "after notify",
        ]
      `);
    });
  });

  describe('type safety', () => {
    it('should preserve event type through to callback', async () => {
      interface MyEvent {
        toolName: string;
        input: { location: string };
        stepNumber: number;
      }

      const received: MyEvent[] = [];

      const callback: Listener<MyEvent> = event => {
        received.push(event);
      };

      await notify({
        event: {
          toolName: 'getWeather',
          input: { location: 'San Francisco' },
          stepNumber: 2,
        },
        callbacks: callback,
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "location": "San Francisco",
            },
            "stepNumber": 2,
            "toolName": "getWeather",
          },
        ]
      `);
    });

    it('should work with complex nested event types', async () => {
      const received: unknown[] = [];

      await notify({
        event: {
          model: { provider: 'openai', modelId: 'gpt-4o' },
          usage: { inputTokens: 100, outputTokens: 50 },
          steps: [{ stepNumber: 0 }, { stepNumber: 1 }],
        },
        callbacks: event => {
          received.push({
            provider: event.model.provider,
            totalSteps: event.steps.length,
          });
        },
      });

      expect(received).toMatchInlineSnapshot(`
        [
          {
            "provider": "openai",
            "totalSteps": 2,
          },
        ]
      `);
    });
  });

  describe('multiple sequential notifications', () => {
    it('should handle repeated calls with the same callback', async () => {
      const events: string[] = [];
      const callback: Listener<string> = event => {
        events.push(event);
      };

      await notify({ event: 'first', callbacks: callback });
      await notify({ event: 'second', callbacks: callback });
      await notify({ event: 'third', callbacks: callback });

      expect(events).toMatchInlineSnapshot(`
        [
          "first",
          "second",
          "third",
        ]
      `);
    });
  });
});

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

describe('notify with OnStartEvent', () => {
  function createEvent(overrides: Partial<OnStartEvent> = {}): OnStartEvent {
    return {
      model: { provider: 'test-provider', modelId: 'test-model' },
      system: undefined,
      prompt: 'test prompt',
      messages: undefined,
      tools: undefined,
      toolChoice: undefined,
      activeTools: undefined,
      maxOutputTokens: undefined,
      temperature: 0.7,
      topP: undefined,
      topK: undefined,
      presencePenalty: undefined,
      frequencyPenalty: undefined,
      stopSequences: undefined,
      seed: undefined,
      maxRetries: 3,
      timeout: undefined,
      headers: undefined,
      providerOptions: undefined,
      stopWhen: undefined,
      output: undefined,
      abortSignal: undefined,
      include: undefined,
      functionId: undefined,
      metadata: undefined,
      experimental_context: undefined,
      ...overrides,
    };
  }

  it('should propagate model and generation settings', async () => {
    const received: Array<{
      provider: string;
      modelId: string;
      temperature: number | undefined;
    }> = [];

    await notify({
      event: createEvent({
        model: { provider: 'openai', modelId: 'gpt-4o' },
        temperature: 0.5,
      }),
      callbacks: event => {
        received.push({
          provider: event.model.provider,
          modelId: event.model.modelId,
          temperature: event.temperature,
        });
      },
    });

    expect(received).toMatchInlineSnapshot(`
      [
        {
          "modelId": "gpt-4o",
          "provider": "openai",
          "temperature": 0.5,
        },
      ]
    `);
  });

  it('should propagate telemetry metadata', async () => {
    const received: Array<{
      functionId: string | undefined;
      metadata: Record<string, unknown> | undefined;
    }> = [];

    await notify({
      event: createEvent({
        functionId: 'chat-assistant',
        metadata: { sessionId: 'session-123' },
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
          "functionId": "chat-assistant",
          "metadata": {
            "sessionId": "session-123",
          },
        },
      ]
    `);
  });
});

describe('notify with OnStepStartEvent', () => {
  function createEvent(
    overrides: Partial<OnStepStartEvent> = {},
  ): OnStepStartEvent {
    return {
      stepNumber: 0,
      model: { provider: 'test-provider', modelId: 'test-model' },
      system: undefined,
      messages: [{ role: 'user', content: 'test message' }],
      tools: undefined,
      toolChoice: undefined,
      activeTools: undefined,
      steps: [],
      providerOptions: undefined,
      timeout: undefined,
      headers: undefined,
      stopWhen: undefined,
      output: undefined,
      abortSignal: undefined,
      include: undefined,
      functionId: undefined,
      metadata: undefined,
      experimental_context: undefined,
      ...overrides,
    };
  }

  it('should propagate step number, model, and messages', async () => {
    const received: Array<{
      stepNumber: number;
      provider: string;
      messageCount: number;
    }> = [];

    await notify({
      event: createEvent({
        stepNumber: 2,
        model: { provider: 'openai', modelId: 'gpt-4o' },
        messages: [
          { role: 'user', content: 'What is the weather?' },
          { role: 'assistant', content: 'Let me check.' },
        ],
      }),
      callbacks: event => {
        received.push({
          stepNumber: event.stepNumber,
          provider: event.model.provider,
          messageCount: event.messages.length,
        });
      },
    });

    expect(received).toMatchInlineSnapshot(`
      [
        {
          "messageCount": 2,
          "provider": "openai",
          "stepNumber": 2,
        },
      ]
    `);
  });

  it('should track multi-step sequences', async () => {
    const steps: Array<{ stepNumber: number; previousStepCount: number }> = [];
    const callback: Listener<OnStepStartEvent> = event => {
      steps.push({
        stepNumber: event.stepNumber,
        previousStepCount: event.steps.length,
      });
    };

    await notify({
      event: createEvent({ stepNumber: 0, steps: [] }),
      callbacks: callback,
    });
    await notify({
      event: createEvent({
        stepNumber: 1,
        steps: [{ stepNumber: 0 }] as never,
      }),
      callbacks: callback,
    });
    await notify({
      event: createEvent({
        stepNumber: 2,
        steps: [{ stepNumber: 0 }, { stepNumber: 1 }] as never,
      }),
      callbacks: callback,
    });

    expect(steps).toMatchInlineSnapshot(`
      [
        {
          "previousStepCount": 0,
          "stepNumber": 0,
        },
        {
          "previousStepCount": 1,
          "stepNumber": 1,
        },
        {
          "previousStepCount": 2,
          "stepNumber": 2,
        },
      ]
    `);
  });
});

describe('notify with OnToolCallStartEvent', () => {
  function createEvent(
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

  it('should propagate tool call information', async () => {
    const received: Array<{
      toolName: string;
      toolCallId: string;
      input: unknown;
    }> = [];

    await notify({
      event: createEvent({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'getWeather',
          input: { location: 'San Francisco', units: 'fahrenheit' },
        },
      }),
      callbacks: event => {
        received.push({
          toolName: event.toolCall.toolName,
          toolCallId: event.toolCall.toolCallId,
          input: event.toolCall.input,
        });
      },
    });

    expect(received).toMatchInlineSnapshot(`
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

  it('should track sequential tool calls', async () => {
    const sequence: Array<{ toolName: string; toolCallId: string }> = [];
    const callback: Listener<OnToolCallStartEvent> = event => {
      sequence.push({
        toolName: event.toolCall.toolName,
        toolCallId: event.toolCall.toolCallId,
      });
    };

    await notify({
      event: createEvent({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'getWeather',
          input: {},
        },
      }),
      callbacks: callback,
    });
    await notify({
      event: createEvent({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'getTime',
          input: {},
        },
      }),
      callbacks: callback,
    });

    expect(sequence).toMatchInlineSnapshot(`
      [
        {
          "toolCallId": "call-1",
          "toolName": "getWeather",
        },
        {
          "toolCallId": "call-2",
          "toolName": "getTime",
        },
      ]
    `);
  });

  it('should propagate complex nested input', async () => {
    const received: unknown[] = [];

    await notify({
      event: createEvent({
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-complex',
          toolName: 'createDocument',
          input: {
            title: 'Report',
            sections: [
              { heading: 'Intro', content: 'Hello' },
              { heading: 'Body', content: 'Main' },
            ],
            metadata: { author: 'AI', tags: ['auto-generated'] },
          },
        },
      }),
      callbacks: event => {
        received.push(event.toolCall.input);
      },
    });

    expect(received).toMatchInlineSnapshot(`
      [
        {
          "metadata": {
            "author": "AI",
            "tags": [
              "auto-generated",
            ],
          },
          "sections": [
            {
              "content": "Hello",
              "heading": "Intro",
            },
            {
              "content": "Main",
              "heading": "Body",
            },
          ],
          "title": "Report",
        },
      ]
    `);
  });
});

describe('notify with OnToolCallFinishEvent', () => {
  function createSuccessEvent(
    overrides: Partial<
      Omit<OnToolCallFinishEvent, 'success' | 'output' | 'error'>
    > & { output?: unknown } = {},
  ): OnToolCallFinishEvent {
    return {
      stepNumber: 0,
      model: { provider: 'test-provider', modelId: 'test-model' },
      toolCall: {
        type: 'tool-call',
        toolCallId: 'test-id',
        toolName: 'testTool',
        input: {},
      },
      messages: [],
      abortSignal: undefined,
      durationMs: 100,
      functionId: undefined,
      metadata: undefined,
      experimental_context: undefined,
      success: true,
      output: { result: 'ok' },
      ...overrides,
    };
  }

  function createErrorEvent(
    overrides: Partial<
      Omit<OnToolCallFinishEvent, 'success' | 'output' | 'error'>
    > & { error?: unknown } = {},
  ): OnToolCallFinishEvent {
    return {
      stepNumber: 0,
      model: { provider: 'test-provider', modelId: 'test-model' },
      toolCall: {
        type: 'tool-call',
        toolCallId: 'test-id',
        toolName: 'testTool',
        input: {},
      },
      messages: [],
      abortSignal: undefined,
      durationMs: 50,
      functionId: undefined,
      metadata: undefined,
      experimental_context: undefined,
      success: false,
      error: new Error('Tool failed'),
      ...overrides,
    };
  }

  it('should propagate successful output and duration', async () => {
    const received: Array<{
      success: boolean;
      output: unknown;
      durationMs: number;
    }> = [];

    await notify({
      event: createSuccessEvent({
        output: { temperature: 72, condition: 'sunny' },
        durationMs: 120,
      }),
      callbacks: event => {
        if (event.success) {
          received.push({
            success: event.success,
            output: event.output,
            durationMs: event.durationMs,
          });
        }
      },
    });

    expect(received).toMatchInlineSnapshot(`
      [
        {
          "durationMs": 120,
          "output": {
            "condition": "sunny",
            "temperature": 72,
          },
          "success": true,
        },
      ]
    `);
  });

  it('should propagate error and duration', async () => {
    const received: Array<{
      success: boolean;
      errorMessage: string;
      durationMs: number;
    }> = [];

    await notify({
      event: createErrorEvent({
        error: new Error('Network timeout'),
        durationMs: 30000,
      }),
      callbacks: event => {
        if (!event.success) {
          received.push({
            success: event.success,
            errorMessage:
              event.error instanceof Error
                ? event.error.message
                : String(event.error),
            durationMs: event.durationMs,
          });
        }
      },
    });

    expect(received).toMatchInlineSnapshot(`
      [
        {
          "durationMs": 30000,
          "errorMessage": "Network timeout",
          "success": false,
        },
      ]
    `);
  });

  it('should support discriminated union narrowing', async () => {
    const successes: unknown[] = [];
    const errors: string[] = [];

    const callback: Listener<OnToolCallFinishEvent> = event => {
      if (event.success) {
        successes.push(event.output);
      } else {
        errors.push(
          event.error instanceof Error
            ? event.error.message
            : String(event.error),
        );
      }
    };

    await notify({
      event: createSuccessEvent({ output: 'ok' }),
      callbacks: callback,
    });
    await notify({
      event: createErrorEvent({ error: new Error('fail') }),
      callbacks: callback,
    });

    expect(successes).toMatchInlineSnapshot(`
      [
        "ok",
      ]
    `);
    expect(errors).toMatchInlineSnapshot(`
      [
        "fail",
      ]
    `);
  });
});

describe('notify with OnStepFinishEvent', () => {
  function createEvent(
    overrides: Partial<OnStepFinishEvent> = {},
  ): OnStepFinishEvent {
    return createMockStepResult(overrides);
  }

  it('should propagate finish reason and usage', async () => {
    const received: Array<{
      finishReason: string;
      inputTokens: number | undefined;
      outputTokens: number | undefined;
    }> = [];

    await notify({
      event: createEvent({
        finishReason: 'tool-calls',
        usage: createMockUsage(150, 75, 225),
      }),
      callbacks: event => {
        received.push({
          finishReason: event.finishReason,
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
        });
      },
    });

    expect(received).toMatchInlineSnapshot(`
      [
        {
          "finishReason": "tool-calls",
          "inputTokens": 150,
          "outputTokens": 75,
        },
      ]
    `);
  });

  it('should propagate text and tool calls', async () => {
    const received: Array<{
      text: string;
      toolNames: string[];
    }> = [];

    await notify({
      event: createEvent({
        text: 'The weather is sunny.',
        toolCalls: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'getWeather',
            input: { location: 'NYC' },
          },
        ],
      }),
      callbacks: event => {
        received.push({
          text: event.text,
          toolNames: event.toolCalls.map(tc => tc.toolName),
        });
      },
    });

    expect(received).toMatchInlineSnapshot(`
      [
        {
          "text": "The weather is sunny.",
          "toolNames": [
            "getWeather",
          ],
        },
      ]
    `);
  });

  it('should track different finish reasons across steps', async () => {
    const reasons: string[] = [];
    const callback: Listener<OnStepFinishEvent> = event => {
      reasons.push(event.finishReason);
    };

    await notify({
      event: createEvent({ finishReason: 'tool-calls' }),
      callbacks: callback,
    });
    await notify({
      event: createEvent({ finishReason: 'tool-calls' }),
      callbacks: callback,
    });
    await notify({
      event: createEvent({ finishReason: 'stop' }),
      callbacks: callback,
    });

    expect(reasons).toMatchInlineSnapshot(`
      [
        "tool-calls",
        "tool-calls",
        "stop",
      ]
    `);
  });

  it('should propagate response metadata', async () => {
    const received: Array<{
      responseId: string | undefined;
      modelId: string | undefined;
    }> = [];

    await notify({
      event: createEvent({
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
});

describe('notify with OnFinishEvent', () => {
  function createEvent(overrides: Partial<OnFinishEvent> = {}): OnFinishEvent {
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

  it('should propagate total usage and steps', async () => {
    const received: Array<{
      stepCount: number;
      totalInputTokens: number | undefined;
      totalOutputTokens: number | undefined;
    }> = [];

    await notify({
      event: createEvent({
        steps: [
          createMockStepResult({ stepNumber: 0, finishReason: 'tool-calls' }),
          createMockStepResult({ stepNumber: 1, finishReason: 'stop' }),
        ],
        totalUsage: createMockUsage(500, 250, 750),
      }),
      callbacks: event => {
        received.push({
          stepCount: event.steps.length,
          totalInputTokens: event.totalUsage.inputTokens,
          totalOutputTokens: event.totalUsage.outputTokens,
        });
      },
    });

    expect(received).toMatchInlineSnapshot(`
      [
        {
          "stepCount": 2,
          "totalInputTokens": 500,
          "totalOutputTokens": 250,
        },
      ]
    `);
  });

  it('should propagate final text and model info', async () => {
    const received: Array<{
      text: string;
      provider: string;
      modelId: string;
    }> = [];

    await notify({
      event: createEvent({
        text: 'The weather is 72°F and sunny.',
        model: { provider: 'anthropic', modelId: 'claude-3-opus' },
      }),
      callbacks: event => {
        received.push({
          text: event.text,
          provider: event.model.provider,
          modelId: event.model.modelId,
        });
      },
    });

    expect(received).toMatchInlineSnapshot(`
      [
        {
          "modelId": "claude-3-opus",
          "provider": "anthropic",
          "text": "The weather is 72°F and sunny.",
        },
      ]
    `);
  });

  it('should propagate per-step usage for analysis', async () => {
    const perStepUsage: Array<{
      stepNumber: number;
      inputTokens: number | undefined;
    }> = [];

    await notify({
      event: createEvent({
        steps: [
          createMockStepResult({
            stepNumber: 0,
            usage: createMockUsage(100, 50, 150),
          }),
          createMockStepResult({
            stepNumber: 1,
            usage: createMockUsage(200, 100, 300),
          }),
        ],
        totalUsage: createMockUsage(300, 150, 450),
      }),
      callbacks: event => {
        for (const step of event.steps) {
          perStepUsage.push({
            stepNumber: step.stepNumber,
            inputTokens: step.usage.inputTokens,
          });
        }
      },
    });

    expect(perStepUsage).toMatchInlineSnapshot(`
      [
        {
          "inputTokens": 100,
          "stepNumber": 0,
        },
        {
          "inputTokens": 200,
          "stepNumber": 1,
        },
      ]
    `);
  });

  it('should propagate tool calls from all steps', async () => {
    const allToolCalls: Array<{
      stepNumber: number;
      toolNames: string[];
    }> = [];

    await notify({
      event: createEvent({
        steps: [
          createMockStepResult({
            stepNumber: 0,
            finishReason: 'tool-calls',
            toolCalls: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                input: {},
              },
            ],
          }),
          createMockStepResult({
            stepNumber: 1,
            finishReason: 'stop',
            toolCalls: [],
          }),
        ],
      }),
      callbacks: event => {
        for (const step of event.steps) {
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
      ]
    `);
  });
});
