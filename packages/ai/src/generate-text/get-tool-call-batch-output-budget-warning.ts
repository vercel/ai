import type { FinishReason, ToolCallBatchOutputBudgetWarning } from '../types';

const OUTPUT_TOKEN_UTILIZATION_WARNING_THRESHOLD = 0.8;

/**
 * Detects a provider-neutral truncation risk without inspecting tool names or
 * arguments. The 80% threshold leaves headroom for provider-specific tool-call
 * serialization overhead while avoiding warnings for comfortably sized calls.
 */
export function getToolCallBatchOutputBudgetWarning({
  maxOutputTokens,
  outputTokens,
  toolCallCount,
  stepNumber,
  finishReason,
}: {
  maxOutputTokens: number | undefined;
  outputTokens: number | undefined;
  toolCallCount: number;
  stepNumber: number;
  finishReason: FinishReason;
}): ToolCallBatchOutputBudgetWarning | undefined {
  if (maxOutputTokens == null || outputTokens == null || toolCallCount < 2) {
    return undefined;
  }

  const outputTokenUtilization = outputTokens / maxOutputTokens;

  if (outputTokenUtilization < OUTPUT_TOKEN_UTILIZATION_WARNING_THRESHOLD) {
    return undefined;
  }

  return {
    type: 'tool-call-batch-output-budget',
    maxOutputTokens,
    outputTokens,
    outputTokenUtilization,
    toolCallCount,
    stepNumber,
    finishReason,
  };
}
