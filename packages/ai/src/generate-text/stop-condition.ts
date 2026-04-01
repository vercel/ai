import { StepResult } from './step-result';
import { ToolSet } from './tool-set';

export type StopCondition<TOOLS extends ToolSet> = (options: {
  steps: Array<StepResult<TOOLS>>;
}) => PromiseLike<boolean> | boolean;

const stepCountSymbol = Symbol.for('ai.stopCondition.stepCount');

export function getStopConditionStepCount(
  condition: StopCondition<any>,
): number | undefined {
  const value = (condition as unknown as Record<symbol, unknown>)[
    stepCountSymbol
  ];
  return typeof value === 'number' ? value : undefined;
}

export function isStepCount(stepCount: number): StopCondition<any> {
  function condition({ steps }: { steps: Array<StepResult<any>> }) {
    return steps.length === stepCount;
  }
  Object.defineProperty(condition, stepCountSymbol, {
    value: stepCount,
    enumerable: false,
  });
  return condition;
}

export function isLoopFinished(): StopCondition<any> {
  return () => false;
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
