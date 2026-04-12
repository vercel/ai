import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import { StepResult } from './step-result';

export type StopCondition<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
> = (options: {
  steps: Array<StepResult<TOOLS, USER_CONTEXT>>;
}) => PromiseLike<boolean> | boolean;

export function isStepCount(stepCount: number): StopCondition<any, any> {
  return ({ steps }) => steps.length === stepCount;
}

export function isLoopFinished(): StopCondition<any, any> {
  return () => false;
}

export function hasToolCall(toolName: string): StopCondition<any, any> {
  return ({ steps }) =>
    steps[steps.length - 1]?.toolCalls?.some(
      toolCall => toolCall.toolName === toolName,
    ) ?? false;
}

export async function isStopConditionMet<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
>({
  stopConditions,
  steps,
}: {
  stopConditions: Array<StopCondition<TOOLS, USER_CONTEXT>>;
  steps: Array<StepResult<TOOLS, USER_CONTEXT>>;
}): Promise<boolean> {
  return (
    await Promise.all(stopConditions.map(condition => condition({ steps })))
  ).some(result => result);
}
