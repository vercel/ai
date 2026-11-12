import {
  isSerializableValue,
  type JSONValue,
  type SerializableValue,
} from '@ai-sdk/provider';
import {
  executeTool,
  getErrorMessage,
  isExecutableTool,
  safeValidateTypes,
  type Experimental_SandboxSession as SandboxSession,
  type Tool,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { InvalidToolInputError, NoSuchToolError } from 'ai';
import { createToolModelOutput, validateToolContext } from 'ai/internal';
import { HarnessInvalidDriveStateError } from '../../../errors/harness-invalid-drive-state-error';
import type {
  HarnessV2ExecuteBuiltinToolFunction,
  HarnessV2ExecuteHostToolFunction,
  HarnessV2ToolExecutionOutput,
  HarnessV2ToolExecutionValue,
} from '../../../v2/harness-v2-drive-context';
import type { HarnessV2EffectContext } from '../../../v2/harness-v2-effect';
import type { HarnessV2NetworkSandboxSession } from '../../../v2/harness-v2-network-sandbox-session';
import type { HarnessV2ToolResult } from '../../../v2/harness-v2-stream-part';
import { isPlainJSONValue } from './utils';
import type { HarnessAgentEffectFunction } from './create-effect-function';

/**
 * Executes one of the app's own tools as a recorded effect. Same as
 * `HarnessV2ExecuteHostToolFunction`, redeclared so the engine does not depend
 * on the adapter-facing type.
 *
 * Each call is recorded as the effect `tool:${toolCallId}` under the tool's
 * replay policy, so a recorded call returns its recorded outcome without
 * running the tool again. Tool values are converted to JSON, and the
 * `tool-result` parts are emitted by the engine. A client tool (no `execute`)
 * resolves `suspended` without being recorded.
 */
export type HarnessAgentExecuteHostToolFunction =
  HarnessV2ExecuteHostToolFunction;

/**
 * Executes one of the harness's built-in tools, implemented by the adapter, as
 * a recorded effect. Same as `HarnessV2ExecuteBuiltinToolFunction`,
 * redeclared so the engine does not depend on the adapter-facing type.
 *
 * Each call is recorded as the effect `tool:${toolCallId}` under the built-in
 * tool's replay policy, and the adapter's `execute` runs inside it, so a
 * recorded call returns its recorded outcome without running again. The
 * `tool-result` parts are emitted by the engine.
 */
export type HarnessAgentExecuteBuiltinToolFunction =
  HarnessV2ExecuteBuiltinToolFunction;

/**
 * Returns the tool registered under the name as an own property, if any.
 */
function getTool(options: {
  /**
   * Tools to look the tool up in.
   */
  tools: ToolSet;

  /**
   * Name of the tool to look up.
   */
  toolName: string;
}): Tool | undefined {
  return Object.hasOwn(options.tools, options.toolName)
    ? options.tools[options.toolName]
    : undefined;
}

/**
 * Returns whether a tool is executed by the provider rather than the host.
 */
function isProviderExecuted(tool: Tool): boolean {
  return tool.type === 'provider' && tool.isProviderExecuted;
}

/**
 * Converts an in-process tool output to a plain JSON value, the same way the
 * AI SDK converts tool outputs for the model: applies `toJSON` (e.g. a `Date`
 * becomes an ISO string), drops `undefined` object properties, and turns a
 * top-level `undefined` into `null`.
 *
 * The value is round-tripped through `JSON.stringify`, so the parsed text is
 * produced from a value that is already materialized in this process and is
 * not untrusted input. `JSON.parse` is used deliberately instead of the
 * secure parser from `@ai-sdk/provider-utils`: the secure parser rejects own
 * `__proto__` and `constructor.prototype` keys, which are valid data in tool
 * outputs (e.g. rows from an external API). `JSON.parse` defines `__proto__`
 * as an own data property and never modifies the prototype chain, so
 * preserving these keys here is safe. Do not reuse this pattern for text that
 * comes from outside the process; use `parseJSON` / `safeParseJSON` instead.
 */
function toJSONValue(options: {
  /**
   * Tool output to convert.
   */
  value: unknown;
}): JSONValue {
  if (options.value === undefined) {
    return null;
  }

  const serialized = JSON.stringify(options.value);
  return serialized === undefined ? null : JSON.parse(serialized);
}

/**
 * Rejects tool call input that is not a plain JSON value.
 *
 * `input` is typed `JSONValue`, but adapters often hold runtime payloads
 * typed `any` (e.g. from `JSON.parse`), which bypass the type. Rejecting them
 * here reports the contract violation clearly instead of failing later while
 * recording the effect.
 */
function assertJSONInput(options: {
  /**
   * Tool call input passed by the adapter.
   */
  input: JSONValue;

  /**
   * Name of the drive context function, for the error message.
   */
  functionName: 'executeHostTool' | 'executeBuiltinTool';
}): void {
  if (!isPlainJSONValue({ value: options.input })) {
    throw new Error(
      `HarnessAgent.${options.functionName}: \`input\` must be a JSON value.`,
    );
  }
}

/**
 * Rejects a value produced by a built-in tool's `execute` that cannot be
 * recorded as a tool value. Thrown inside the attempt, so it becomes the
 * call's `error` outcome.
 */
function validateBuiltinToolValue(options: {
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

  /**
   * Whether the part belongs to a dynamic tool call.
   */
  dynamic?: boolean;
}): void {
  const { context, toolCallId, toolName, result } = options;
  const part: HarnessV2ToolResult = {
    type: 'tool-result',
    toolCallId,
    toolName,
    result,
  };
  if (options.isError) part.isError = true;
  if (options.preliminary) part.preliminary = true;
  if (options.dynamic) part.dynamic = true;
  context.emit(part);
}

/**
 * Emits the error `tool-result` part of a failed attempt, unless the attempt
 * was aborted or the drive state is invalid, which are not tool failures.
 */
function emitToolError(options: {
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

  /**
   * Whether the part belongs to a dynamic tool call.
   */
  dynamic?: boolean;
}): void {
  const { context, toolCallId, toolName, error, dynamic } = options;
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
    dynamic,
  });
}

/**
 * Creates the drive context's `executeHostTool()` and `executeBuiltinTool()`
 * for one drive.
 *
 * Both run each call as the effect `tool:${toolCallId}` named
 * `tool.${toolName}`, with the tool's `replay` policy (`'never'` when
 * omitted). A call already recorded returns its recorded outcome: the tool
 * does not run again and no stream parts are emitted again. A recorded
 * retryable interruption runs the tool again in a new attempt. Every
 * preliminary, final and error `tool-result` part is emitted through the
 * attempt's `emit()`, so readers can withdraw them if the attempt is
 * interrupted. An aborted attempt emits no error part and resolves
 * `interrupted`. Input that is not a JSON value rejects without recording,
 * since it can only come from an adapter bug. Concurrent calls with the same
 * `toolCallId` reject through `effect()`.
 *
 * `executeHostTool()` runs one of the app's own tools. Inside a fresh
 * attempt, the call is validated (unknown or provider-executed tools, input
 * that does not match the input schema, tool context), the sandbox is
 * resolved, and the tool is executed. Validation failures and thrown errors
 * become recorded `error` outcomes. Preliminary values of a generator tool
 * are recorded as partial output. Values are converted to JSON, and
 * `modelOutput` is computed from the raw output only when the tool defines
 * `toModelOutput`. A tool without `execute` that the provider does not
 * execute is a client tool: the call resolves `suspended` without being
 * recorded.
 *
 * `executeBuiltinTool()` runs one of the harness's built-in tools with the
 * implementation the adapter passes as `execute`, with the attempt's abort
 * signal. Each value an async iterable yields is recorded as partial output
 * and emitted as a preliminary `tool-result` part; the last one is the final
 * value, emitted as the final `tool-result` part once the iterable is done.
 * A value that is not a valid tool value, an iterable that yields nothing and
 * a thrown error become recorded `error` outcomes. A call to a tool that is
 * not one of the harness's built-in tools is recorded as an `error` without
 * running `execute`.
 */
export function createExecuteToolFunctions(options: {
  /**
   * The agent's own tools, without the harness's built-in tools.
   */
  tools: ToolSet;

  /**
   * The harness's built-in tools.
   */
  builtinTools: ToolSet;

  /**
   * Effect function of the current drive.
   */
  effect: HarnessAgentEffectFunction;

  /**
   * Resolves the session's sandbox session. Called only inside a fresh
   * attempt of an executable host tool.
   */
  getSandboxSession: () => Promise<
    SandboxSession | HarnessV2NetworkSandboxSession
  >;
}): {
  executeHostTool: HarnessAgentExecuteHostToolFunction;
  executeBuiltinTool: HarnessAgentExecuteBuiltinToolFunction;
} {
  const { tools, builtinTools, effect, getSandboxSession } = options;

  /**
   * Runs one attempt of a host tool call, emitting its `tool-result` parts
   * and yielding its partial and final values for the effect to record.
   *
   * @yields A `HarnessV2ToolExecutionValue` per preliminary value, then the
   * final value with its model output. The effect records them as partial
   * and final output, so they are exactly what `executeHostTool()` returns.
   */
  async function* runHostTool(options: {
    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Name of the called tool.
     */
    toolName: string;

    /**
     * Tool input, already parsed from the model's JSON.
     */
    toolInput: JSONValue;

    /**
     * The called tool, if it is one of the agent's own tools.
     */
    tool?: Tool;

    /**
     * Context of the current effect attempt.
     */
    context: HarnessV2EffectContext;
  }): AsyncGenerator<SerializableValue> {
    const { toolCallId, toolName, toolInput, tool, context } = options;
    const dynamic =
      tool == null || isProviderExecuted(tool) || tool.type === 'dynamic';

    try {
      if (tool == null || isProviderExecuted(tool) || !isExecutableTool(tool)) {
        throw new NoSuchToolError({
          toolName,
          availableTools: Object.keys(tools).filter(name => {
            const candidate = getTool({ tools, toolName: name });
            return (
              candidate != null &&
              !isProviderExecuted(candidate) &&
              isExecutableTool(candidate)
            );
          }),
        });
      }

      const parsedInput = await safeValidateTypes({
        value: toolInput,
        schema: tool.inputSchema,
      });
      if (!parsedInput.success) {
        throw new InvalidToolInputError({
          toolName,
          toolInput: JSON.stringify(toolInput),
          cause: parsedInput.error,
        });
      }

      let toolContext: unknown;
      try {
        // TODO: Pass the agent's `toolsContext` once HarnessAgent supports it.
        toolContext = await validateToolContext({
          toolName,
          context: undefined,
          contextSchema: tool.contextSchema,
        });
      } catch {
        /*
         * Tool context is host-only and can contain credentials, so neither
         * its value nor schema diagnostics may reach the recorded error or the
         * model.
         */
        throw new Error('Tool context validation failed.');
      }

      const sandboxSession = await getSandboxSession();

      let rawOutput: unknown;
      for await (const part of executeTool({
        tool,
        input: parsedInput.value,
        options: {
          toolCallId,
          // TODO: Pass the turn's messages once the engine tracks them.
          messages: [],
          abortSignal: context.abortSignal,
          context: toolContext as never,
          experimental_sandbox: sandboxSession,
        },
      })) {
        if (part.type === 'preliminary') {
          const raw = toJSONValue({ value: part.output });
          emitToolResult({
            context,
            toolCallId,
            toolName,
            result: raw,
            preliminary: true,
            dynamic,
          });
          yield { raw } satisfies HarnessV2ToolExecutionValue;
        } else {
          rawOutput = part.output;
        }
      }

      const raw = toJSONValue({ value: rawOutput });
      const modelOutput =
        tool.toModelOutput == null
          ? undefined
          : await createToolModelOutput({
              toolCallId,
              input: parsedInput.value,
              output: rawOutput,
              tool,
              errorMode: 'none',
            });
      if (modelOutput != null && !isSerializableValue(modelOutput)) {
        throw new Error(
          `The model output of tool '${toolName}' is not serializable.`,
        );
      }

      emitToolResult({ context, toolCallId, toolName, result: raw, dynamic });
      /*
       * The cast is needed because `ToolResultOutput` contains interfaces,
       * which TypeScript never treats as `SerializableValue`; the value was
       * verified to be serializable at runtime above.
       */
      yield (modelOutput == null
        ? { raw }
        : {
            raw,
            modelOutput,
          }) satisfies HarnessV2ToolExecutionValue as SerializableValue;
    } catch (error) {
      emitToolError({ context, toolCallId, toolName, error, dynamic });
      throw error;
    }
  }

  /**
   * Runs one attempt of a built-in tool call whose `execute` returned a
   * promise: records and emits its value as the final value.
   */
  async function runBuiltinToolPromise(options: {
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
      validateBuiltinToolValue({ value });
      emitToolResult({ context, toolCallId, toolName, result: value.raw });
      /*
       * The cast is needed because `ToolResultOutput` contains interfaces,
       * which TypeScript never treats as `SerializableValue`; the value was
       * verified to be serializable above.
       */
      return value as SerializableValue;
    } catch (error) {
      emitToolError({ context, toolCallId, toolName, error });
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
  async function* runBuiltinToolIterable(options: {
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
        validateBuiltinToolValue({ value });
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
      emitToolError({ context, toolCallId, toolName, error });
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
      emitToolError({ context, toolCallId, toolName, error });
      return Promise.reject(error);
    }
    return Symbol.asyncIterator in result
      ? runBuiltinToolIterable({
          toolCallId,
          toolName,
          iterable: result,
          context,
        })
      : runBuiltinToolPromise({
          toolCallId,
          toolName,
          pending: result,
          context,
        });
  }

  return {
    async executeHostTool<T extends JSONValue = JSONValue>(call: {
      toolCallId: string;
      toolName: string;
      input: JSONValue;
    }): Promise<HarnessV2ToolExecutionOutput<T>> {
      const { toolCallId, toolName, input: toolInput } = call;
      const tool = getTool({ tools, toolName });

      if (
        tool != null &&
        !isProviderExecuted(tool) &&
        !isExecutableTool(tool)
      ) {
        // TODO: Validate the input before suspending once client tool results are supported.
        return { type: 'suspended', reason: 'client-tool' };
      }

      assertJSONInput({ input: toolInput, functionName: 'executeHostTool' });

      const output = await effect({
        key: `tool:${toolCallId}`,
        name: `tool.${toolName}`,
        replay: tool?.replay ?? 'never',
        input: toolInput,
        fn: context =>
          runHostTool({ toolCallId, toolName, toolInput, tool, context }),
      });

      /*
       * Every partial and final value the effect records is yielded by
       * `runHostTool()` as a `HarnessV2ToolExecutionValue`, so the recorded
       * output already has the shape adapters receive.
       */
      return output as HarnessV2ToolExecutionOutput<T>;
    },

    async executeBuiltinTool<T extends JSONValue = JSONValue>(call: {
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

      assertJSONInput({ input, functionName: 'executeBuiltinTool' });

      const tool = getTool({ tools: builtinTools, toolName });
      const output = await effect({
        key: `tool:${toolCallId}`,
        name: `tool.${toolName}`,
        replay: tool?.replay ?? 'never',
        input,
        fn: context =>
          runBuiltinTool({ toolCallId, toolName, tool, execute, context }),
      });

      /*
       * Every partial and final value the effect records is yielded or
       * returned by `runBuiltinTool()` as a `HarnessV2ToolExecutionValue`, so
       * the recorded output already has the shape adapters receive.
       */
      return output as HarnessV2ToolExecutionOutput<T>;
    },
  };
}
