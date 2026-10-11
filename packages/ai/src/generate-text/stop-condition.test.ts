import { describe, expect, it } from 'vitest';
import type { StepResult } from './step-result';
import {
  hasToolCall,
  isLoopFinished,
  isStepCount,
  isStopConditionMet,
} from './stop-condition';

function createStepResult({
  toolCalls = [],
}: {
  toolCalls?: StepResult<any, any>['toolCalls'];
} = {}): StepResult<any, any> {
  return {
    toolCalls,
  } as StepResult<any, any>;
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

  describe('isStopConditionMet', () => {
    it('should return true when any stop condition returns true', async () => {
      await expect(
        isStopConditionMet({
          stopConditions: [() => false, () => true, () => false],
          steps: [createStepResult()],
        }),
      ).resolves.toBe(true);
    });

    it('should return true without waiting for pending stop conditions', async () => {
      let releasePendingCondition!: (value: boolean) => void;
      const pendingCondition = new Promise<boolean>(resolve => {
        releasePendingCondition = resolve;
      });
      let settled = false;

      const result = isStopConditionMet({
        stopConditions: [() => true, () => pendingCondition],
        steps: [createStepResult()],
      }).then(value => {
        settled = true;
        return value;
      });

      await new Promise<void>(resolve => setImmediate(resolve));
      expect(settled).toBe(true);

      releasePendingCondition(false);
      await expect(result).resolves.toBe(true);
    });

    it('should return false when all stop conditions return false', async () => {
      await expect(
        isStopConditionMet({
          stopConditions: [() => false, () => false],
          steps: [createStepResult()],
        }),
      ).resolves.toBe(false);
    });

    it('should wait for all stop conditions before returning false', async () => {
      let releasePendingCondition!: (value: boolean) => void;
      const pendingCondition = new Promise<boolean>(resolve => {
        releasePendingCondition = resolve;
      });
      let settled = false;

      const result = isStopConditionMet({
        stopConditions: [() => false, () => pendingCondition],
        steps: [createStepResult()],
      }).then(value => {
        settled = true;
        return value;
      });

      await new Promise<void>(resolve => setImmediate(resolve));
      expect(settled).toBe(false);

      releasePendingCondition(false);
      await expect(result).resolves.toBe(false);
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

    it('should reject without waiting for pending stop conditions', async () => {
      let releasePendingCondition!: (value: boolean) => void;
      const pendingCondition = new Promise<boolean>(resolve => {
        releasePendingCondition = resolve;
      });
      const error = new Error('stop condition failed');
      let rejection: unknown;

      const result = isStopConditionMet({
        stopConditions: [
          () => pendingCondition,
          async () => {
            throw error;
          },
        ],
        steps: [createStepResult()],
      }).catch(cause => {
        rejection = cause;
      });

      await new Promise<void>(resolve => setImmediate(resolve));
      expect(rejection).toBe(error);

      releasePendingCondition(false);
      await result;
    });

    it('should handle rejections after a stop condition returns true', async () => {
      let rejectPendingCondition!: (error: Error) => void;
      const pendingCondition = new Promise<boolean>((_, reject) => {
        rejectPendingCondition = reject;
      });
      let outcome: boolean | Error | undefined;

      const result = isStopConditionMet({
        stopConditions: [() => true, () => pendingCondition],
        steps: [createStepResult()],
      })
        .then(value => {
          outcome = value;
        })
        .catch(error => {
          outcome = error;
        });

      await new Promise<void>(resolve => setImmediate(resolve));
      const settledBeforeRejection = outcome === true;
      rejectPendingCondition(new Error('late stop condition failure'));
      await result;
      await new Promise<void>(resolve => setImmediate(resolve));

      expect(settledBeforeRejection).toBe(true);
      expect(outcome).toBe(true);
    });
  });
});
