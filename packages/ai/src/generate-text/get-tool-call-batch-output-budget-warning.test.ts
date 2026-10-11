import { describe, expect, it } from 'vitest';
import { getToolCallBatchOutputBudgetWarning } from './get-tool-call-batch-output-budget-warning';

describe('getToolCallBatchOutputBudgetWarning', () => {
  it('returns a warning when a tool-call batch consumes 80% of the output budget', () => {
    expect(
      getToolCallBatchOutputBudgetWarning({
        maxOutputTokens: 100,
        outputTokens: 80,
        toolCallCount: 2,
        stepNumber: 1,
        finishReason: 'length',
      }),
    ).toEqual({
      type: 'tool-call-batch-output-budget',
      maxOutputTokens: 100,
      outputTokens: 80,
      outputTokenUtilization: 0.8,
      toolCallCount: 2,
      stepNumber: 1,
      finishReason: 'length',
    });
  });

  it('does not return a warning below 80% utilization', () => {
    expect(
      getToolCallBatchOutputBudgetWarning({
        maxOutputTokens: 100,
        outputTokens: 79,
        toolCallCount: 2,
        stepNumber: 0,
        finishReason: 'tool-calls',
      }),
    ).toBeUndefined();
  });

  it('does not return a warning for a single tool call', () => {
    expect(
      getToolCallBatchOutputBudgetWarning({
        maxOutputTokens: 32,
        outputTokens: 32,
        toolCallCount: 1,
        stepNumber: 0,
        finishReason: 'length',
      }),
    ).toBeUndefined();
  });

  it('does not return a warning without an explicit budget or reported output usage', () => {
    expect(
      getToolCallBatchOutputBudgetWarning({
        maxOutputTokens: undefined,
        outputTokens: 32,
        toolCallCount: 2,
        stepNumber: 0,
        finishReason: 'length',
      }),
    ).toBeUndefined();

    expect(
      getToolCallBatchOutputBudgetWarning({
        maxOutputTokens: 32,
        outputTokens: undefined,
        toolCallCount: 2,
        stepNumber: 0,
        finishReason: 'length',
      }),
    ).toBeUndefined();
  });
});
