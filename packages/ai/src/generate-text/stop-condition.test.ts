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
}: {
  toolCalls?: StepResult<any, any>['toolCalls'];
  toolResults?: StepResult<any, any>['toolResults'];
} = {}): StepResult<any, any> {
  return {
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
  return { toolCallId, toolName, input } as any;
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
  return { toolCallId, toolName, input, output } as any;
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

    it('should compare the JSON serialization of inputs', () => {
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
      ).toBe(false);
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

    it('should return false instead of throwing for values that cannot be JSON serialized', () => {
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
