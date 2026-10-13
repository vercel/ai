import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import type { StepResult } from './step-result';

/**
 * A predicate that can request another model step when the loop would otherwise
 * finish naturally.
 *
 * Normal tool-call continuation rules still apply. A matching `stopWhen`
 * condition takes precedence and stops the loop.
 */
export type ContinueCondition<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = (options: {
  steps: Array<StepResult<TOOLS, RUNTIME_CONTEXT>>;
}) => PromiseLike<boolean> | boolean;
