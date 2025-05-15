import { StepResult } from './step-result';
import { ToolSet } from './tool-set';

export type StopCondition<TOOLS extends ToolSet> = (options: {
  steps: Array<StepResult<TOOLS>>;
}) => PromiseLike<boolean> | boolean;

export function maxSteps(maxSteps: number): StopCondition<any> {
  return ({ steps }) => steps.length >= maxSteps;
}

export function hasToolCall(toolName: string): StopCondition<any> {
  return ({ steps }) =>
    steps[steps.length - 1]?.toolCalls?.some(
      toolCall => toolCall.toolName === toolName,
    ) ?? false;
}
