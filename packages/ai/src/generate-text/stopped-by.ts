import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import { isToolExecutionAllowedFinishReason } from './is-tool-execution-allowed-finish-reason';
import type { StepResult } from './step-result';

/**
 * Why a generation stopped its tool loop:
 *
 * - `model`: the model finished without tool calls that continue the loop,
 *   e.g. it gave a final answer, hit the output limit, or its call was
 *   interrupted. `finishReason` tells how the last model call finished.
 * - `stop-condition`: a `stopWhen` condition was met.
 * - `tool-without-execute`: a tool call needs a result from a tool without an
 *   `execute` function.
 * - `approval`: a tool call needs an approval.
 */
export type StoppedBy =
  | 'model'
  | 'stop-condition'
  | 'tool-without-execute'
  | 'approval';

export function getPendingToolCallStoppedBy({
  finishReason,
  content,
}: Pick<StepResult<ToolSet, Context>, 'finishReason' | 'content'>): StoppedBy {
  if (!isToolExecutionAllowedFinishReason(finishReason)) {
    return 'model';
  }

  return content.some(
    part => part.type === 'tool-approval-request' && part.isAutomatic !== true,
  )
    ? 'approval'
    : 'tool-without-execute';
}
