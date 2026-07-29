import type { Context, ToolSet } from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import type { ContentPart } from './content-part';
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
 * and deterministically serialized inputs. Object key order is ignored and
 * duplicate calls are preserved.
 *
 * @param count - The number of consecutive identical tool-calling steps that
 * should trigger the stop condition. Must be an integer greater than 1.
 * @param options.compareResults - Whether deterministically serialized tool
 * results or errors must also match. When enabled, every tool call must have a
 * corresponding final result or error.
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
  const signatureCache = new WeakMap<StepResult<any, any>, string | null>();

  const getSignature = (step: StepResult<any, any>) => {
    const cachedSignature = signatureCache.get(step);
    if (cachedSignature !== undefined) {
      return cachedSignature ?? undefined;
    }

    const signature = createToolCallSignature({ step, compareResults });
    signatureCache.set(step, signature ?? null);
    return signature;
  };

  return ({ steps }) => {
    if (steps.length < count) {
      return false;
    }

    const recentSteps = steps.slice(-count);
    const expectedSignature = getSignature(recentSteps[0]);

    return (
      expectedSignature != null &&
      recentSteps
        .slice(1)
        .every(step => getSignature(step) === expectedSignature)
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

  const finalOutputs = step.content.filter(isFinalToolOutput);
  const outputsByToolCallId = new Map(
    finalOutputs.map(output => [output.toolCallId, output]),
  );

  if (
    compareResults &&
    (outputsByToolCallId.size !== finalOutputs.length ||
      finalOutputs.length !== step.toolCalls.length)
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

    const toolOutput = outputsByToolCallId.get(toolCall.toolCallId);
    if (toolOutput == null || toolOutput.toolName !== toolCall.toolName) {
      return undefined;
    }

    const serializedOutput = serializeForComparison(
      toolOutput.type === 'tool-result' ? toolOutput.output : toolOutput.error,
    );
    if (serializedOutput == null) {
      return undefined;
    }

    callSignatures.push(
      JSON.stringify([
        toolCall.toolName,
        serializedInput,
        toolOutput.type,
        serializedOutput,
      ]),
    );
  }

  return JSON.stringify(callSignatures.sort());
}

function isFinalToolOutput(
  part: ContentPart<any>,
): part is Extract<ContentPart<any>, { type: 'tool-result' | 'tool-error' }> {
  return (
    part.type === 'tool-error' ||
    (part.type === 'tool-result' && !part.preliminary)
  );
}

function serializeForComparison(value: unknown): string | undefined {
  try {
    return serializeValue({ value, key: '', ancestors: new Set() });
  } catch {
    // e.g. a cyclic value, a bigint, or a throwing toJSON or getter
    return undefined;
  }
}

function serializeValue({
  value,
  key,
  ancestors,
  applyToJSON = true,
}: {
  value: unknown;
  key: string;
  ancestors: Set<object>;
  applyToJSON?: boolean;
}): string | undefined {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'string':
      return `string:${JSON.stringify(value)}`;
    case 'boolean':
      return `boolean:${value}`;
    case 'number':
      return Number.isFinite(value)
        ? `number:${Object.is(value, -0) ? '-0' : JSON.stringify(value)}`
        : undefined;
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      return undefined;
  }

  if (applyToJSON) {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function') {
      return serializeValue({
        value: toJSON.call(value, key),
        key,
        ancestors,
        applyToJSON: false,
      });
    }
  }

  if (ancestors.has(value)) {
    return undefined;
  }

  ancestors.add(value);

  try {
    if (value instanceof Error) {
      if (Object.getOwnPropertySymbols(value).length > 0) {
        return undefined;
      }

      const properties = Object.keys(value)
        .filter(property => property !== 'cause')
        .sort()
        .map(property => {
          const serializedProperty = serializeValue({
            value: (value as unknown as Record<string, unknown>)[property],
            key: property,
            ancestors,
          });
          return serializedProperty == null
            ? undefined
            : `${JSON.stringify(property)}:${serializedProperty}`;
        });

      if (properties.some(property => property == null)) {
        return undefined;
      }

      const serializedCause =
        'cause' in value
          ? serializeValue({
              value: value.cause,
              key: 'cause',
              ancestors,
            })
          : 'absent';

      if (serializedCause == null) {
        return undefined;
      }

      return `error:{name:${serializeValue({
        value: value.name,
        key: 'name',
        ancestors,
      })},message:${serializeValue({
        value: value.message,
        key: 'message',
        ancestors,
      })},cause:${serializedCause},properties:{${properties.join(',')}}}`;
    }

    if (Array.isArray(value)) {
      if (
        Object.getOwnPropertySymbols(value).length > 0 ||
        Object.getOwnPropertyNames(value).length !== value.length + 1
      ) {
        return undefined;
      }

      const items: string[] = [];
      for (let index = 0; index < value.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          return undefined;
        }

        const serializedItem = serializeValue({
          value: value[index],
          key: String(index),
          ancestors,
        });
        if (serializedItem == null) {
          return undefined;
        }
        items.push(serializedItem);
      }

      return `array:[${items.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      return undefined;
    }

    const enumerableKeys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).length !== enumerableKeys.length) {
      return undefined;
    }

    const entries: string[] = [];
    for (const property of enumerableKeys.sort()) {
      const serializedProperty = serializeValue({
        value: (value as Record<string, unknown>)[property],
        key: property,
        ancestors,
      });
      if (serializedProperty == null) {
        return undefined;
      }
      entries.push(`${JSON.stringify(property)}:${serializedProperty}`);
    }

    return `object:{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
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
