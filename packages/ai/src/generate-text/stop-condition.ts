import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import type { StepResult } from './step-result';

/**
 * A predicate that decides whether a tool-calling loop should stop after the
 * current step.
 *
 * A tool calling loop continues until one of the following conditions is met:
 * - The model returns a finish reason other than `tool-calls`
 * - A tool without an execute function is called
 * - A tool call needs approval
 * - One of the provided stop conditions returns `true`
 */
export type StopCondition<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
> = (options: {
  steps: Array<StepResult<TOOLS, RUNTIME_CONTEXT>>;
}) => PromiseLike<boolean> | boolean;

/**
 * Creates a stop condition that returns `true` when the number of completed
 * steps equals `stepCount`.
 *
 * @param stepCount - The number of steps to allow before stopping.
 */
export function isStepCount(stepCount: number): StopCondition<any, any> {
  return ({ steps }) => steps.length === stepCount;
}

/**
 * Creates a stop condition that never returns `true`.
 *
 * This lets the tool-calling loop continue until it reaches one of its
 * natural termination conditions.
 */
export function isLoopFinished(): StopCondition<any, any> {
  return () => false;
}

/**
 * Creates a stop condition that returns `true` when the most recent step
 * contains a tool call with any of the specified names.
 *
 * @param toolName - The names of the tools that should stop the loop.
 */
export function hasToolCall<TOOLS extends ToolSet>(
  ...toolName: Array<keyof TOOLS | (string & {})> // autocomplete support for tool names
): StopCondition<TOOLS, any> {
  return ({ steps }) =>
    steps[steps.length - 1]?.toolCalls?.some(toolCall =>
      toolName.includes(toolCall.toolName),
    ) ?? false;
}

/**
 * Creates a stop condition that returns `true` when the most recent steps
 * repeat the same tool calls.
 *
 * Tool calls are compared as an order-independent collection of tool names
 * and JSON-serialized inputs. Duplicate calls are preserved.
 *
 * @param count - The number of consecutive identical tool-calling steps that
 * should trigger the stop condition. Must be an integer greater than 1.
 * @param options.compareResults - Whether JSON-serialized tool outputs must
 * also match. When enabled, every tool call must have a corresponding result.
 */
export function hasRepeatedToolCalls(
  count: number,
  options?: {
    compareResults?: boolean;
  },
): StopCondition<any, any> {
  if (!Number.isInteger(count) || count < 2) {
    throw new InvalidArgumentError({
      parameter: 'count',
      value: count,
      message: 'count must be an integer greater than 1',
    });
  }

  const compareResults = options?.compareResults ?? false;

  return ({ steps }) => {
    if (steps.length < count) {
      return false;
    }

    const recentSteps = steps.slice(-count);
    const expectedSignature = createToolCallSignature({
      step: recentSteps[0],
      compareResults,
    });

    return (
      expectedSignature != null &&
      recentSteps
        .slice(1)
        .every(
          step =>
            createToolCallSignature({ step, compareResults }) ===
            expectedSignature,
        )
    );
  };
}

function createToolCallSignature({
  step,
  compareResults,
}: {
  step: StepResult<any, any>;
  compareResults: boolean;
}): string | undefined {
  if (step.toolCalls.length === 0) {
    return undefined;
  }

  const resultsByToolCallId = new Map(
    step.toolResults.map(result => [result.toolCallId, result]),
  );

  if (
    compareResults &&
    (resultsByToolCallId.size !== step.toolResults.length ||
      step.toolResults.length !== step.toolCalls.length)
  ) {
    return undefined;
  }

  const callSignatures: string[] = [];

  for (const toolCall of step.toolCalls) {
    const serializedInput = serializeForComparison(toolCall.input);

    if (serializedInput == null) {
      return undefined;
    }

    if (!compareResults) {
      callSignatures.push(JSON.stringify([toolCall.toolName, serializedInput]));
      continue;
    }

    const toolResult = resultsByToolCallId.get(toolCall.toolCallId);
    if (toolResult == null || toolResult.toolName !== toolCall.toolName) {
      return undefined;
    }

    const serializedOutput = serializeForComparison(toolResult.output);
    if (serializedOutput == null) {
      return undefined;
    }

    callSignatures.push(
      JSON.stringify([toolCall.toolName, serializedInput, serializedOutput]),
    );
  }

  return JSON.stringify(callSignatures.sort());
}

function serializeForComparison(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * Evaluates the provided stop conditions for the current list of steps.
 *
 * Returns `true` as soon as any stop condition is met.
 *
 * @param stopConditions - The stop conditions to evaluate.
 * @param steps - The completed steps accumulated so far.
 */
export async function isStopConditionMet<
  TOOLS extends ToolSet,
  RUNTIME_CONTEXT extends Context = Context,
>({
  stopConditions,
  steps,
}: {
  stopConditions: Array<StopCondition<TOOLS, RUNTIME_CONTEXT>>;
  steps: Array<StepResult<TOOLS, RUNTIME_CONTEXT>>;
}): Promise<boolean> {
  return (
    await Promise.all(stopConditions.map(condition => condition({ steps })))
  ).some(result => result);
}
