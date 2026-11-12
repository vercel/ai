import {
  isSerializableValue,
  type JSONValue,
  type SerializableValue,
} from '@ai-sdk/provider';
import {
  getErrorMessage,
  type Tool,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { NoSuchToolError } from 'ai';
import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import type {
  HarnessV2ToolExecutionOutput,
  HarnessV2ToolExecutionValue,
} from '../../../v2/harness-v2-drive-context';
import type { HarnessV2EffectContext } from '../../../v2/harness-v2-effect';
import type { HarnessV2ToolResult } from '../../../v2/harness-v2-stream-part';
import type {
  HarnessAgentEffectFunction,
  HarnessAgentExecuteBuiltinToolFunction,
} from './types';
import { isPlainJSONValue } from './utils';

/**
 * Returns the built-in tool registered under the name as an own property, if
 * any.
 */
function getTool(options: {
  /**
   * The harness's built-in tools.
   */
  builtinTools: ToolSet;

  /**
   * Name of the tool to look up.
   */
  toolName: string;
}): Tool | undefined {
  return Object.hasOwn(options.builtinTools, options.toolName)
    ? options.builtinTools[options.toolName]
    : undefined;
}

/**
 * Rejects a value produced by `execute` that cannot be recorded as a tool
 * value. Thrown inside the attempt, so it becomes the call's `error` outcome.
 */
function validateValue(options: {
  /**
   * Partial or final value produced by `execute`.
   */
  value: HarnessV2ToolExecutionValue;
}): void {
  const { value } = options;
  if (
    value == null ||
    typeof value !== 'object' ||
    !Object.hasOwn(value, 'raw') ||
    !isPlainJSONValue({ value: value.raw })
  ) {
    throw new Error(
      'HarnessAgent.executeBuiltinTool: `raw` must be a JSON value.',
    );
  }
  if (
    value.modelOutput !== undefined &&
    !isSerializableValue(value.modelOutput)
  ) {
    throw new Error(
      'HarnessAgent.executeBuiltinTool: `modelOutput` must be serializable.',
    );
  }
}

/**
 * Emits a `tool-result` part attributed to an effect attempt.
 */
function emitToolResult(options: {
  /**
   * Context of the attempt that produced the part.
   */
  context: HarnessV2EffectContext;

  /**
   * ID of the tool call.
   */
  toolCallId: string;

  /**
   * Name of the called tool.
   */
  toolName: string;

  /**
   * JSON result or error message.
   */
  result: JSONValue;

  /**
   * Whether the part reports an error.
   */
  isError?: boolean;

  /**
   * Whether the part is a preliminary result.
   */
  preliminary?: boolean;
}): void {
  const { context, toolCallId, toolName, result, isError, preliminary } =
    options;
  const part: HarnessV2ToolResult = {
    type: 'tool-result',
    toolCallId,
    toolName,
    result,
  };
  if (isError) part.isError = true;
  if (preliminary) part.preliminary = true;
  context.emit(part);
}

/**
 * Creates the drive context's `executeBuiltinTool()` for one drive.
 *
 * Each call runs as the effect `tool:${toolCallId}` named `tool.${toolName}`,
 * with the built-in tool's `replay` policy (`'never'` when omitted). A call
 * already recorded returns its recorded outcome: `execute` does not run again
 * and no stream parts are emitted again. A recorded retryable interruption
 * runs `execute` again in a new attempt.
 *
 * Inside a fresh attempt, the adapter's `execute` runs with the attempt's
 * abort signal. Each value an async iterable yields is recorded as partial
 * output and emitted as a preliminary `tool-result` part; the last one is the
 * final value, emitted as the final `tool-result` part once the iterable is
 * done. A value that is not a valid tool value, an iterable that yields
 * nothing and a thrown error become recorded `error` outcomes with an error
 * `tool-result` part. An aborted attempt emits no error part and resolves
 * `interrupted`.
 *
 * A call to a tool that is not one of the harness's built-in tools is
 * recorded as an `error` without running `execute`. Input that is not a JSON
 * value rejects without recording, since only an adapter bug can produce it.
 * Concurrent calls with the same `toolCallId` reject through `effect()`.
 */
export function createExecuteBuiltinToolFunction(options: {
  /**
   * The harness's built-in tools.
   */
  builtinTools: ToolSet;

  /**
   * Effect function of the current drive.
   */
  effect: HarnessAgentEffectFunction;
}): HarnessAgentExecuteBuiltinToolFunction {
  const { builtinTools, effect } = options;

  /**
   * Emits the error `tool-result` part of a failed attempt, unless the attempt
   * was aborted or the drive state is invalid, which are not tool failures.
   */
  function emitError(options: {
    /**
     * Context of the attempt that failed.
     */
    context: HarnessV2EffectContext;

    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Name of the called tool.
     */
    toolName: string;

    /**
     * What the attempt threw.
     */
    error: unknown;
  }): void {
    const { context, toolCallId, toolName, error } = options;
    if (
      context.abortSignal.aborted ||
      HarnessInvalidDriveStateError.isInstance(error)
    ) {
      return;
    }
    let message: string;
    try {
      message = getErrorMessage(error) ?? String(error);
    } catch {
      message = 'Unknown effect error';
    }
    emitToolResult({
      context,
      toolCallId,
      toolName,
      result: message,
      isError: true,
    });
  }

  /**
   * Runs one attempt of a built-in tool call whose `execute` returned a
   * promise: records and emits its value as the final value.
   */
  async function runPromise(options: {
    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Name of the called tool.
     */
    toolName: string;

    /**
     * Final value returned by `execute`.
     */
    pending: PromiseLike<HarnessV2ToolExecutionValue>;

    /**
     * Context of the current effect attempt.
     */
    context: HarnessV2EffectContext;
  }): Promise<SerializableValue> {
    const { toolCallId, toolName, pending, context } = options;
    try {
      const value = await pending;
      validateValue({ value });
      emitToolResult({ context, toolCallId, toolName, result: value.raw });
      /*
       * The cast is needed because `ToolResultOutput` contains interfaces,
       * which TypeScript never treats as `SerializableValue`; the value was
       * verified to be serializable above.
       */
      return value as SerializableValue;
    } catch (error) {
      emitError({ context, toolCallId, toolName, error });
      throw error;
    }
  }

  /**
   * Runs one attempt of a built-in tool call whose `execute` returned an async
   * iterable: records and emits each value as a partial value, and the last
   * one as the final value.
   *
   * @yields Each value the iterable produces. The effect records every
   * yielded value as partial output and the last one as the final output, so
   * the recorded output is exactly what `executeBuiltinTool()` returns.
   */
  async function* runIterable(options: {
    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Name of the called tool.
     */
    toolName: string;

    /**
     * Values produced by `execute`.
     */
    iterable: AsyncIterable<HarnessV2ToolExecutionValue>;

    /**
     * Context of the current effect attempt.
     */
    context: HarnessV2EffectContext;
  }): AsyncGenerator<SerializableValue> {
    const { toolCallId, toolName, iterable, context } = options;
    try {
      let last: HarnessV2ToolExecutionValue | undefined;
      for await (const value of iterable) {
        validateValue({ value });
        emitToolResult({
          context,
          toolCallId,
          toolName,
          result: value.raw,
          preliminary: true,
        });
        last = value;
        /*
         * The cast is needed because `ToolResultOutput` contains interfaces,
         * which TypeScript never treats as `SerializableValue`; the value was
         * verified to be serializable above.
         */
        yield value as SerializableValue;
      }
      if (last == null) {
        throw new Error(`The built-in tool '${toolName}' produced no value.`);
      }
      emitToolResult({ context, toolCallId, toolName, result: last.raw });
    } catch (error) {
      emitError({ context, toolCallId, toolName, error });
      throw error;
    }
  }

  /**
   * Starts one attempt of a built-in tool call: fails it for a tool that is
   * not a built-in tool, and otherwise runs the adapter's `execute`.
   */
  function runBuiltinTool(options: {
    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Name of the called tool.
     */
    toolName: string;

    /**
     * The called built-in tool, if it is one.
     */
    tool?: Tool;

    /**
     * Runs the tool, supplied by the adapter.
     */
    execute: Parameters<HarnessAgentExecuteBuiltinToolFunction>[0]['execute'];

    /**
     * Context of the current effect attempt.
     */
    context: HarnessV2EffectContext;
  }): PromiseLike<SerializableValue> | AsyncIterable<SerializableValue> {
    const { toolCallId, toolName, tool, execute, context } = options;
    let result: ReturnType<typeof execute>;
    try {
      if (tool == null) {
        throw new NoSuchToolError({
          toolName,
          availableTools: Object.keys(builtinTools),
        });
      }
      result = execute({ abortSignal: context.abortSignal });
    } catch (error) {
      emitError({ context, toolCallId, toolName, error });
      return Promise.reject(error);
    }
    return Symbol.asyncIterator in result
      ? runIterable({ toolCallId, toolName, iterable: result, context })
      : runPromise({ toolCallId, toolName, pending: result, context });
  }

  return async function executeBuiltinTool<
    T extends JSONValue = JSONValue,
  >(call: {
    toolCallId: string;
    toolName: string;
    input: JSONValue;
    execute: (options: {
      abortSignal: AbortSignal;
    }) =>
      | PromiseLike<HarnessV2ToolExecutionValue<T>>
      | AsyncIterable<HarnessV2ToolExecutionValue<T>>;
  }): Promise<HarnessV2ToolExecutionOutput<T>> {
    const { toolCallId, toolName, input, execute } = call;

    /*
     * `input` is typed `JSONValue`, but adapters often hold runtime payloads
     * typed `any` (e.g. from `JSON.parse`), which bypass the type. Rejecting
     * them here reports the contract violation clearly instead of failing
     * later while recording the effect.
     */
    if (!isPlainJSONValue({ value: input })) {
      throw new Error(
        'HarnessAgent.executeBuiltinTool: `input` must be a JSON value.',
      );
    }

    const tool = getTool({ builtinTools, toolName });
    const output = await effect({
      key: `tool:${toolCallId}`,
      name: `tool.${toolName}`,
      replay: tool?.replay ?? 'never',
      input,
      fn: context =>
        runBuiltinTool({ toolCallId, toolName, tool, execute, context }),
    });

    /*
     * Every partial and final value the effect records is yielded by
     * `runBuiltinTool()` as a `HarnessV2ToolExecutionValue`, so the recorded
     * output already has the shape adapters receive.
     */
    return output as HarnessV2ToolExecutionOutput<T>;
  };
}
