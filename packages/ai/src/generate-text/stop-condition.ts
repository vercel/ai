import { ContextRegistry } from '@ai-sdk/provider-utils';
import { StepResult } from './step-result';
import { ToolSet } from './tool-set';

export type StopCondition<
  CONTEXT extends Partial<ContextRegistry>,
  TOOLS extends ToolSet<CONTEXT> = ToolSet<CONTEXT>,
> = (options: {
  steps: Array<StepResult<CONTEXT, TOOLS>>;
}) => PromiseLike<boolean> | boolean;

export function stepCountIs(stepCount: number): StopCondition<any> {
  return ({ steps }) => steps.length === stepCount;
}

export function hasToolCall(toolName: string): StopCondition<any> {
  return ({ steps }) =>
    steps[steps.length - 1]?.toolCalls?.some(
      toolCall => toolCall.toolName === toolName,
    ) ?? false;
}

export async function isStopConditionMet<TOOLS extends ToolSet>({
  stopConditions,
  steps,
}: {
  stopConditions: Array<StopCondition<TOOLS>>;
  steps: Array<StepResult<TOOLS>>;
}): Promise<boolean> {
  return (
    await Promise.all(stopConditions.map(condition => condition({ steps })))
  ).some(result => result);
}
