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
  HarnessV2ToolExecutionOutput,
  HarnessV2ToolExecutionValue,
} from '../../../v2/harness-v2-drive-context';
import type { HarnessV2EffectContext } from '../../../v2/harness-v2-effect';
import type { HarnessV2NetworkSandboxSession } from '../../../v2/harness-v2-network-sandbox-session';
import type {
  HarnessAgentEffectFunction,
  HarnessAgentExecuteHostToolFunction,
} from './types';
import { isPlainJSONValue } from './utils';

/**
 * Returns the tool registered under the name as an own property, if any.
 */
function getTool(options: {
  /**
   * The agent's own tools.
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
 * Creates the drive context's `executeHostTool()` for one drive.
 *
 * Each call runs as the effect `tool:${toolCallId}` named `tool.${toolName}`,
 * with the tool's `replay` policy (`'never'` when omitted). A call already
 * recorded returns its recorded outcome: the tool does not run again and no
 * stream parts are emitted again. A recorded retryable interruption runs the
 * tool again in a new attempt.
 *
 * Inside a fresh attempt, the call is validated (unknown or provider-executed
 * tools, input that does not match the input schema, tool context), the
 * sandbox is resolved, and the tool is executed. Validation failures and
 * thrown errors become recorded `error` outcomes. Preliminary values of a
 * generator tool are recorded as partial output. Values are converted to
 * JSON, and `modelOutput` is computed from the raw output only when the tool
 * defines `toModelOutput`. Every preliminary, final and error `tool-result`
 * part is emitted through the attempt's `emit()`, so readers can withdraw
 * them if the attempt is interrupted. An aborted attempt emits no error part
 * and resolves `interrupted`.
 *
 * A tool without `execute` that the provider does not execute is a client
 * tool: the call resolves `suspended` without being recorded. Input that is
 * not a JSON value rejects, since it can only come from an adapter bug.
 * Concurrent calls with the same `toolCallId` reject through `effect()`.
 */
export function createExecuteHostToolFunction(options: {
  /**
   * The agent's own tools, without the harness's built-in tools.
   */
  tools: ToolSet;

  /**
   * Effect function of the current drive.
   */
  effect: HarnessAgentEffectFunction;

  /**
   * Resolves the session's sandbox session. Called only inside a fresh
   * attempt of an executable tool.
   */
  getSandboxSession: () => Promise<
    SandboxSession | HarnessV2NetworkSandboxSession
  >;
}): HarnessAgentExecuteHostToolFunction {
  const { tools, effect, getSandboxSession } = options;

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
    tool: Tool | undefined;

    /**
     * Context of the current effect attempt.
     */
    context: HarnessV2EffectContext;
  }): AsyncGenerator<SerializableValue> {
    const { toolCallId, toolName, toolInput, tool, context } = options;
    const dynamic =
      tool == null || isProviderExecuted(tool) || tool.type === 'dynamic';

    /**
     * Emits a `tool-result` part attributed to this attempt.
     */
    function emitResult(options: {
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
      context.emit({
        type: 'tool-result',
        toolCallId,
        toolName,
        result: options.result,
        ...(options.isError ? { isError: true } : {}),
        ...(options.preliminary ? { preliminary: true } : {}),
        ...(dynamic ? { dynamic: true } : {}),
      });
    }

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
          emitResult({ result: raw, preliminary: true });
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

      emitResult({ result: raw });
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
      if (
        !context.abortSignal.aborted &&
        !HarnessInvalidDriveStateError.isInstance(error)
      ) {
        let message: string;
        try {
          message = getErrorMessage(error) ?? String(error);
        } catch {
          message = 'Unknown effect error';
        }
        emitResult({ result: message, isError: true });
      }
      throw error;
    }
  }

  return async function executeHostTool<T extends JSONValue = JSONValue>(call: {
    toolCallId: string;
    toolName: string;
    input: JSONValue;
  }): Promise<HarnessV2ToolExecutionOutput<T>> {
    const { toolCallId, toolName, input: toolInput } = call;
    const tool = getTool({ tools, toolName });

    if (tool != null && !isProviderExecuted(tool) && !isExecutableTool(tool)) {
      // TODO: Validate the input before suspending once client tool results are supported.
      return { type: 'suspended', reason: 'client-tool' };
    }

    /*
     * `input` is typed `JSONValue`, but adapters often hold runtime payloads
     * typed `any` (e.g. from `JSON.parse`), which bypass the type. Rejecting
     * them here reports the contract violation clearly instead of failing
     * later while recording the effect.
     */
    if (!isPlainJSONValue({ value: toolInput })) {
      throw new Error(
        'HarnessAgent.executeHostTool: `input` must be a JSON value.',
      );
    }

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
  };
}
