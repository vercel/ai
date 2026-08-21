import { describe, expect, it } from 'vitest';
import type { StepResult } from './step-result';
import {
  hasRepeatedToolCalls,
  hasToolCall,
  isLoopFinished,
  isStepCount,
  isStopConditionMet,
} from './stop-condition';

function createStepResult({
  toolCalls = [],
  toolResults = [],
  toolErrors = [],
  content = [...toolCalls, ...toolResults, ...toolErrors],
}: {
  toolCalls?: StepResult<any, any>['toolCalls'];
  toolResults?: StepResult<any, any>['toolResults'];
  toolErrors?: Array<any>;
  content?: StepResult<any, any>['content'];
} = {}): StepResult<any, any> {
  return {
    content,
    toolCalls,
    toolResults,
  } as StepResult<any, any>;
}

function createToolCall({
  toolCallId,
  toolName,
  input,
}: {
  toolCallId: string;
  toolName: string;
  input: unknown;
}) {
  return { type: 'tool-call', toolCallId, toolName, input } as any;
}

function createToolResult({
  toolCallId,
  toolName,
  input,
  output,
}: {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
}) {
  return {
    type: 'tool-result',
    toolCallId,
    toolName,
    input,
    output,
  } as any;
}

function createToolError({
  toolCallId,
  toolName,
  input,
  error,
}: {
  toolCallId: string;
  toolName: string;
  input: unknown;
  error: unknown;
}) {
  return {
    type: 'tool-error',
    toolCallId,
    toolName,
    input,
    error,
  } as any;
}

describe('stop conditions', () => {
  describe('isStepCount', () => {
    it('should return true when the step count matches exactly', () => {
      const stopCondition = isStepCount(2);

      expect(
        stopCondition({
          steps: [createStepResult(), createStepResult()],
        }),
      ).toBe(true);
    });

    it('should return false when the step count does not match exactly', () => {
      const stopCondition = isStepCount(2);

      expect(stopCondition({ steps: [createStepResult()] })).toBe(false);
      expect(
        stopCondition({
          steps: [createStepResult(), createStepResult(), createStepResult()],
        }),
      ).toBe(false);
    });
  });

  describe('isLoopFinished', () => {
    it('should always return false', () => {
      const stopCondition = isLoopFinished();

      expect(stopCondition({ steps: [] })).toBe(false);
      expect(stopCondition({ steps: [createStepResult()] })).toBe(false);
    });
  });

  describe('hasToolCall', () => {
    it('should return true when the last step contains the specified tool call', () => {
      const stopCondition = hasToolCall('finalAnswer');

      expect(
        stopCondition({
          steps: [
            createStepResult(),
            createStepResult({
              toolCalls: [{ toolName: 'finalAnswer' }] as any,
            }),
          ],
        }),
      ).toBe(true);
    });

    it('should return false when the specified tool call only appears in earlier steps', () => {
      const stopCondition = hasToolCall('finalAnswer');

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [{ toolName: 'finalAnswer' }] as any,
            }),
            createStepResult(),
          ],
        }),
      ).toBe(false);
    });

    it('should return true when the last step contains any tool call from the provided tool names', () => {
      const toolNames = ['search', 'finalAnswer'] as const;
      const stopCondition = hasToolCall(...toolNames);

      expect(
        stopCondition({
          steps: [
            createStepResult(),
            createStepResult({
              toolCalls: [{ toolName: 'finalAnswer' }] as any,
            }),
          ],
        }),
      ).toBe(true);
    });

    it('should return false when the last step does not contain any tool call from the provided tool names', () => {
      const toolNames = ['search', 'finalAnswer'] as const;
      const stopCondition = hasToolCall(...toolNames);

      expect(
        stopCondition({
          steps: [
            createStepResult(),
            createStepResult({
              toolCalls: [{ toolName: 'weather' }] as any,
            }),
          ],
        }),
      ).toBe(false);
    });

    it('should return false when there are no steps', () => {
      const stopCondition = hasToolCall('finalAnswer');

      expect(stopCondition({ steps: [] })).toBe(false);
    });
  });

  describe('hasRepeatedToolCalls', () => {
    it('should return true when the requested number of recent steps contain identical tool calls', () => {
      const stopCondition = hasRepeatedToolCalls(3);
      let toolCallNumber = 0;
      const repeatedStep = () =>
        createStepResult({
          toolCalls: [
            createToolCall({
              toolCallId: `call-${++toolCallNumber}`,
              toolName: 'weather',
              input: { city: 'San Francisco' },
            }),
          ],
        });

      expect(
        stopCondition({
          steps: [repeatedStep(), repeatedStep()],
        }),
      ).toBe(false);
      expect(
        stopCondition({
          steps: [repeatedStep(), repeatedStep(), repeatedStep()],
        }),
      ).toBe(true);
    });

    it('should only compare the requested number of recent steps', () => {
      const stopCondition = hasRepeatedToolCalls(2);

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  input: { city: 'London' },
                }),
              ],
            }),
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-2',
                  toolName: 'weather',
                  input: { city: 'Paris' },
                }),
              ],
            }),
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-3',
                  toolName: 'weather',
                  input: { city: 'Paris' },
                }),
              ],
            }),
          ],
        }),
      ).toBe(true);
    });

    it('should return false when a recent step has no tool calls', () => {
      const stopCondition = hasRepeatedToolCalls(3);
      const weatherCall = (toolCallId: string) =>
        createToolCall({
          toolCallId,
          toolName: 'weather',
          input: { city: 'San Francisco' },
        });

      expect(
        stopCondition({
          steps: [
            createStepResult({ toolCalls: [weatherCall('call-1')] }),
            createStepResult(),
            createStepResult({ toolCalls: [weatherCall('call-3')] }),
          ],
        }),
      ).toBe(false);
    });

    it('should return false when a tool name or serialized input changes', () => {
      const stopCondition = hasRepeatedToolCalls(2);

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  input: { city: 'London' },
                }),
              ],
            }),
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-2',
                  toolName: 'forecast',
                  input: { city: 'London' },
                }),
              ],
            }),
          ],
        }),
      ).toBe(false);

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  input: { city: 'London' },
                }),
              ],
            }),
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-2',
                  toolName: 'weather',
                  input: { city: 'Paris' },
                }),
              ],
            }),
          ],
        }),
      ).toBe(false);
    });

    it('should compare parallel calls without considering their order and preserve duplicates', () => {
      const stopCondition = hasRepeatedToolCalls(2);
      const weatherCall = (toolCallId: string) =>
        createToolCall({
          toolCallId,
          toolName: 'weather',
          input: { city: 'London' },
        });
      const searchCall = (toolCallId: string) =>
        createToolCall({
          toolCallId,
          toolName: 'search',
          input: { query: 'events' },
        });

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [
                weatherCall('call-1'),
                searchCall('call-2'),
                weatherCall('call-3'),
              ],
            }),
            createStepResult({
              toolCalls: [
                weatherCall('call-4'),
                weatherCall('call-5'),
                searchCall('call-6'),
              ],
            }),
          ],
        }),
      ).toBe(true);

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [
                weatherCall('call-1'),
                searchCall('call-2'),
                weatherCall('call-3'),
              ],
            }),
            createStepResult({
              toolCalls: [weatherCall('call-4'), searchCall('call-5')],
            }),
          ],
        }),
      ).toBe(false);
    });

    it('should ignore object key insertion order in inputs', () => {
      const stopCondition = hasRepeatedToolCalls(2);

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  input: { city: 'London', units: 'celsius' },
                }),
              ],
            }),
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-2',
                  toolName: 'weather',
                  input: { units: 'celsius', city: 'London' },
                }),
              ],
            }),
          ],
        }),
      ).toBe(true);
    });

    it('should compare zero-argument calls with empty object inputs', () => {
      const repeatedStep = (toolCallId: string) =>
        createStepResult({
          toolCalls: [
            createToolCall({
              toolCallId,
              toolName: 'getCurrentTime',
              input: {},
            }),
          ],
        });

      expect(
        hasRepeatedToolCalls(2)({
          steps: [repeatedStep('call-1'), repeatedStep('call-2')],
        }),
      ).toBe(true);
    });

    it('should cache signatures for completed step objects', () => {
      let inputReads = 0;
      const repeatedStep = (toolCallId: string) =>
        createStepResult({
          toolCalls: [
            createToolCall({
              toolCallId,
              toolName: 'status',
              input: {
                get jobId() {
                  inputReads++;
                  return 'job-1';
                },
              },
            }),
          ],
        });
      const steps = [repeatedStep('call-1'), repeatedStep('call-2')];
      const stopCondition = hasRepeatedToolCalls(2);

      expect(stopCondition({ steps })).toBe(true);
      expect(stopCondition({ steps })).toBe(true);
      expect(inputReads).toBe(2);
    });

    it('should compare matching tool outputs when compareResults is enabled', () => {
      const stopCondition = hasRepeatedToolCalls(2, {
        compareResults: true,
      });

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-1',
                  toolName: 'status',
                  input: { jobId: 'job-1' },
                }),
              ],
              toolResults: [
                createToolResult({
                  toolCallId: 'call-1',
                  toolName: 'status',
                  input: { jobId: 'job-1' },
                  output: { state: 'pending' },
                }),
              ],
            }),
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-2',
                  toolName: 'status',
                  input: { jobId: 'job-1' },
                }),
              ],
              toolResults: [
                createToolResult({
                  toolCallId: 'call-2',
                  toolName: 'status',
                  input: { jobId: 'job-1' },
                  output: { state: 'pending' },
                }),
              ],
            }),
          ],
        }),
      ).toBe(true);
    });

    it('should return false when outputs change and compareResults is enabled', () => {
      const stopCondition = hasRepeatedToolCalls(2, {
        compareResults: true,
      });

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-1',
                  toolName: 'status',
                  input: { jobId: 'job-1' },
                }),
              ],
              toolResults: [
                createToolResult({
                  toolCallId: 'call-1',
                  toolName: 'status',
                  input: { jobId: 'job-1' },
                  output: { progress: 10 },
                }),
              ],
            }),
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-2',
                  toolName: 'status',
                  input: { jobId: 'job-1' },
                }),
              ],
              toolResults: [
                createToolResult({
                  toolCallId: 'call-2',
                  toolName: 'status',
                  input: { jobId: 'job-1' },
                  output: { progress: 20 },
                }),
              ],
            }),
          ],
        }),
      ).toBe(false);
    });

    it('should return false when compareResults is enabled and a result is missing', () => {
      const stopCondition = hasRepeatedToolCalls(2, {
        compareResults: true,
      });
      const toolCall = (toolCallId: string) =>
        createToolCall({
          toolCallId,
          toolName: 'status',
          input: { jobId: 'job-1' },
        });

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [toolCall('call-1')],
              toolResults: [
                createToolResult({
                  toolCallId: 'call-1',
                  toolName: 'status',
                  input: { jobId: 'job-1' },
                  output: { state: 'pending' },
                }),
              ],
            }),
            createStepResult({ toolCalls: [toolCall('call-2')] }),
          ],
        }),
      ).toBe(false);
    });

    it('should compare matching tool errors when compareResults is enabled', () => {
      const stopCondition = hasRepeatedToolCalls(2, {
        compareResults: true,
      });
      const failedStep = (toolCallId: string) => {
        const input = { city: 'London' };
        return createStepResult({
          toolCalls: [
            createToolCall({
              toolCallId,
              toolName: 'weather',
              input,
            }),
          ],
          toolErrors: [
            createToolError({
              toolCallId,
              toolName: 'weather',
              input,
              error: new Error('service unavailable'),
            }),
          ],
        });
      };

      expect(
        stopCondition({
          steps: [failedStep('call-1'), failedStep('call-2')],
        }),
      ).toBe(true);
    });

    it('should return false when tool errors change and compareResults is enabled', () => {
      const stopCondition = hasRepeatedToolCalls(2, {
        compareResults: true,
      });
      const failedStep = (toolCallId: string, message: string) => {
        const input = { city: 'London' };
        return createStepResult({
          toolCalls: [
            createToolCall({
              toolCallId,
              toolName: 'weather',
              input,
            }),
          ],
          toolErrors: [
            createToolError({
              toolCallId,
              toolName: 'weather',
              input,
              error: new Error(message),
            }),
          ],
        });
      };

      expect(
        stopCondition({
          steps: [
            failedStep('call-1', 'service unavailable'),
            failedStep('call-2', 'invalid input'),
          ],
        }),
      ).toBe(false);
    });

    it('should ignore preliminary results when a final result is available', () => {
      const stopCondition = hasRepeatedToolCalls(2, {
        compareResults: true,
      });
      const completedStep = (toolCallId: string, preliminary: number) => {
        const input = { jobId: 'job-1' };
        const toolCall = createToolCall({
          toolCallId,
          toolName: 'status',
          input,
        });
        const finalResult = createToolResult({
          toolCallId,
          toolName: 'status',
          input,
          output: { progress: 100 },
        });
        return createStepResult({
          toolCalls: [toolCall],
          toolResults: [finalResult],
          content: [
            toolCall,
            {
              ...finalResult,
              output: { progress: preliminary },
              preliminary: true,
            },
            finalResult,
          ],
        });
      };

      expect(
        stopCondition({
          steps: [completedStep('call-1', 10), completedStep('call-2', 20)],
        }),
      ).toBe(true);
    });

    it('should return false when only a preliminary result is available', () => {
      const stopCondition = hasRepeatedToolCalls(2, {
        compareResults: true,
      });
      const preliminaryStep = (toolCallId: string) => {
        const input = { jobId: 'job-1' };
        const toolCall = createToolCall({
          toolCallId,
          toolName: 'status',
          input,
        });
        return createStepResult({
          toolCalls: [toolCall],
          content: [
            toolCall,
            {
              ...createToolResult({
                toolCallId,
                toolName: 'status',
                input,
                output: { progress: 10 },
              }),
              preliminary: true,
            },
          ],
        });
      };

      expect(
        stopCondition({
          steps: [preliminaryStep('call-1'), preliminaryStep('call-2')],
        }),
      ).toBe(false);
    });

    it('should return false when a deferred result has no call in the same step', () => {
      const stopCondition = hasRepeatedToolCalls(2, {
        compareResults: true,
      });
      const stepWithDeferredResult = (
        toolCallId: string,
        deferredToolCallId: string,
      ) => {
        const input = { jobId: 'job-1' };
        return createStepResult({
          toolCalls: [
            createToolCall({
              toolCallId,
              toolName: 'status',
              input,
            }),
          ],
          toolResults: [
            createToolResult({
              toolCallId,
              toolName: 'status',
              input,
              output: { progress: 10 },
            }),
            createToolResult({
              toolCallId: deferredToolCallId,
              toolName: 'deferred',
              input: undefined,
              output: { done: true },
            }),
          ],
        });
      };

      expect(
        stopCondition({
          steps: [
            stepWithDeferredResult('call-1', 'deferred-1'),
            stepWithDeferredResult('call-2', 'deferred-2'),
          ],
        }),
      ).toBe(false);
    });

    it('should return false for consecutive steps without tool calls', () => {
      expect(
        hasRepeatedToolCalls(2)({
          steps: [createStepResult(), createStepResult()],
        }),
      ).toBe(false);
    });

    it('should return false for duplicate result IDs', () => {
      const input = { jobId: 'job-1' };
      const toolCall = (toolCallId: string) =>
        createToolCall({ toolCallId, toolName: 'status', input });
      const duplicateResultStep = (toolCallId: string) =>
        createStepResult({
          toolCalls: [toolCall(toolCallId)],
          toolResults: [
            createToolResult({
              toolCallId,
              toolName: 'status',
              input,
              output: 'pending',
            }),
            createToolResult({
              toolCallId,
              toolName: 'status',
              input,
              output: 'pending',
            }),
          ],
        });

      expect(
        hasRepeatedToolCalls(2, { compareResults: true })({
          steps: [duplicateResultStep('call-1'), duplicateResultStep('call-2')],
        }),
      ).toBe(false);
    });

    it('should return false when a result tool name does not match its call', () => {
      const input = { jobId: 'job-1' };
      const mismatchedStep = (toolCallId: string) =>
        createStepResult({
          toolCalls: [
            createToolCall({
              toolCallId,
              toolName: 'status',
              input,
            }),
          ],
          toolResults: [
            createToolResult({
              toolCallId,
              toolName: 'other',
              input,
              output: 'pending',
            }),
          ],
        });

      expect(
        hasRepeatedToolCalls(2, { compareResults: true })({
          steps: [mismatchedStep('call-1'), mismatchedStep('call-2')],
        }),
      ).toBe(false);
    });

    describe('comparison of values that JSON.stringify represents lossily', () => {
      function repeatsWithOutputs(first: unknown, second: unknown) {
        return hasRepeatedToolCalls(2, { compareResults: true })({
          steps: [
            createOutputStep({ toolCallId: 'call-1', output: first }),
            createOutputStep({ toolCallId: 'call-2', output: second }),
          ],
        });
      }

      function createOutputStep({
        toolCallId,
        output,
      }: {
        toolCallId: string;
        output: unknown;
      }): StepResult<any, any> {
        return createStepResult({
          toolCalls: [
            createToolCall({
              toolCallId,
              toolName: 'status',
              input: { jobId: 'job-1' },
            }),
          ],
          toolResults: [
            createToolResult({
              toolCallId,
              toolName: 'status',
              input: { jobId: 'job-1' },
              output,
            }),
          ],
        });
      }

      it.each([
        [{ progress: undefined }, {}],
        [[undefined], [null]],
        [new Map([['a', 1]]), new Map([['b', 2]])],
        [new Set([1]), new Set([2])],
        [Number.NaN, Number.POSITIVE_INFINITY],
        [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
        [{ notify: () => 'a' }, { notify: () => 'b' }],
        [{ token: Symbol('a') }, {}],
        [
          { meta: { cache: new Map([['a', 1]]) } },
          { meta: { cache: new Map([['b', 2]]) } },
        ],
      ])('should not compare lossy values %#', (first, second) => {
        expect(repeatsWithOutputs(first, second)).toBe(false);
      });

      it('should reject a value whose toJSON throws instead of throwing', () => {
        const throwing = () => ({
          toJSON() {
            throw new Error('boom');
          },
        });

        expect(repeatsWithOutputs(throwing(), throwing())).toBe(false);
      });

      it('should distinguish dates, which serialize through toJSON', () => {
        expect(repeatsWithOutputs(new Date(0), new Date(1))).toBe(false);
      });

      it('should treat equal dates as repeated', () => {
        expect(repeatsWithOutputs(new Date(0), new Date(0))).toBe(true);
      });

      it('should treat equal supported structures as repeated', () => {
        const output = () => ({
          done: false,
          percent: 0,
          note: null,
          items: [1, 'a', { deep: true }],
        });

        expect(repeatsWithOutputs(output(), output())).toBe(true);
      });

      it('should compare null-prototype objects', () => {
        const output = () =>
          Object.assign(Object.create(null), { state: 'pending' });

        expect(repeatsWithOutputs(output(), output())).toBe(true);
      });

      it('should compare values that share a reference in two places', () => {
        const shared = { x: 1 };

        expect(
          repeatsWithOutputs(
            { a: shared, b: shared },
            { a: { x: 1 }, b: { x: 1 } },
          ),
        ).toBe(true);
      });
    });

    it('should return false instead of throwing for unsupported values', () => {
      const stopCondition = hasRepeatedToolCalls(2);
      const cyclicInput: Record<string, unknown> = {};
      cyclicInput.self = cyclicInput;

      expect(
        stopCondition({
          steps: [
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-1',
                  toolName: 'inspect',
                  input: cyclicInput,
                }),
              ],
            }),
            createStepResult({
              toolCalls: [
                createToolCall({
                  toolCallId: 'call-2',
                  toolName: 'inspect',
                  input: cyclicInput,
                }),
              ],
            }),
          ],
        }),
      ).toBe(false);
    });

    it.each([0, 1, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'should reject invalid count %s',
      count => {
        expect(() => hasRepeatedToolCalls(count)).toThrow(
          'Invalid argument for parameter count: count must be an integer greater than 1',
        );
      },
    );
  });

  describe('isStopConditionMet', () => {
    it('should return true when any stop condition returns true', async () => {
      await expect(
        isStopConditionMet({
          stopConditions: [() => false, () => true, () => false],
          steps: [createStepResult()],
        }),
      ).resolves.toBe(true);
    });

    it('should return false when all stop conditions return false', async () => {
      await expect(
        isStopConditionMet({
          stopConditions: [() => false, () => false],
          steps: [createStepResult()],
        }),
      ).resolves.toBe(false);
    });

    it('should support asynchronous stop conditions', async () => {
      await expect(
        isStopConditionMet({
          stopConditions: [
            async () => false,
            async ({ steps }) => steps.length === 2,
          ],
          steps: [createStepResult(), createStepResult()],
        }),
      ).resolves.toBe(true);
    });

    it('should reject when a stop condition rejects', async () => {
      await expect(
        isStopConditionMet({
          stopConditions: [
            () => false,
            async () => {
              throw new Error('stop condition failed');
            },
          ],
          steps: [createStepResult()],
        }),
      ).rejects.toThrow('stop condition failed');
    });
  });
});
