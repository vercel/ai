import { Context } from '@ai-sdk/provider-utils';
import { StepResult } from './step-result';
import { ExpandedContext, ToolSet } from './tool-set';

export type StopCondition<
  TOOLS extends ToolSet,
  CONTEXT extends ExpandedContext<TOOLS>,
> = (options: {
  steps: Array<StepResult<TOOLS, CONTEXT>>;
}) => PromiseLike<boolean> | boolean;

export function stepCountIs(stepCount: number): StopCondition<any, any> {
  return ({ steps }) => steps.length === stepCount;
}

export function hasToolCall(toolName: string): StopCondition<any, any> {
  return ({ steps }) =>
    steps[steps.length - 1]?.toolCalls?.some(
      toolCall => toolCall.toolName === toolName,
    ) ?? false;
}

export async function isStopConditionMet<
  TOOLS extends ToolSet,
  CONTEXT extends ExpandedContext<TOOLS>,
>({
  stopConditions,
  steps,
}: {
  stopConditions: Array<StopCondition<TOOLS, CONTEXT>>;
  steps: Array<StepResult<TOOLS, CONTEXT>>;
}): Promise<boolean> {
  return (
    await Promise.all(stopConditions.map(condition => condition({ steps })))
  ).some(result => result);
}
