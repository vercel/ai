import {
  RunBindingError,
  RunError,
  createRunner,
  getBindingContext,
  type BindingFunction,
  type BindingGroup,
} from 'run';
import {
  CodeModeAbortedError,
  CodeModeBridgeLimitError,
  CodeModeConcurrencyError,
  CodeModeDetachedBridgeRequestError,
  CodeModeError,
  CodeModeProtocolError,
  CodeModeSourceTooLargeError,
  CodeModeTimeoutError,
  CodeModeToolError,
} from './errors.js';
import {
  invokeHostTool,
  unwrapCodeModeInterruptPayload,
} from './tool-invocation.js';
import type {
  CodeModeToolExecutionOptions,
  RunCodeModeInput,
} from './types.js';
import { normalizeOptions } from './utils/options.js';

const defaultCodeModeRunner = createRunner({
  continuationAudience: '@ai-sdk/code-mode',
});

/**
 * Runs one code-mode invocation directly without wrapping it as an AI SDK tool.
 *
 * The source is executed in a fresh QuickJS context with the provided host tools
 * and execution limits.
 *
 * @param input - Source code, host tools, forwarded tool execution options, and code-mode options.
 * @returns The serializable JavaScript value returned by the sandboxed program.
 */
export async function runCodeMode(input: RunCodeModeInput): Promise<unknown> {
  const baseExecutionOptions = createBaseExecutionOptions(input);
  const tools: BindingGroup = Object.fromEntries(
    Object.keys(input.tools).map(toolName => [
      toolName,
      createToolBinding({ toolName, input, baseExecutionOptions }),
    ]),
  );

  try {
    const runJavaScript =
      input.options?.continuationCodec === undefined &&
      input.options?.continuationSecret === undefined
        ? defaultCodeModeRunner.run
        : createRunner({
            ...(input.options.continuationSecret !== undefined
              ? { continuationSecret: input.options.continuationSecret }
              : {}),
            ...(input.options.continuationCodec !== undefined
              ? { continuationCodec: input.options.continuationCodec }
              : {}),
            continuationAudience: '@ai-sdk/code-mode',
          }).run;
    const result = await runJavaScript({
      source: input.js,
      bindings: { tools },
      limits: toRunLimits(input),
      ...(input.toolExecutionOptions?.abortSignal !== undefined
        ? { abortSignal: input.toolExecutionOptions.abortSignal }
        : {}),
      ...(input.continuation !== undefined
        ? { continuation: input.continuation }
        : {}),
      ...(input.resolutions !== undefined
        ? { resolutions: input.resolutions }
        : {}),
      continuationContext: {
        caller: input.continuationContext ?? null,
        outerToolCallId: input.toolExecutionOptions?.toolCallId ?? null,
      },
    });
    return result.status === 'completed'
      ? result.value
      : {
          ...result,
          interruptions: result.interruptions.map(interruption => ({
            ...interruption,
            payload: unwrapCodeModeInterruptPayload(interruption.payload),
          })),
        };
  } catch (error) {
    throw toCodeModeError(error, Object.keys(input.tools));
  }
}

function createToolBinding({
  toolName,
  input,
  baseExecutionOptions,
}: {
  toolName: string;
  input: RunCodeModeInput;
  baseExecutionOptions: CodeModeToolExecutionOptions & {
    interrupt(payload: unknown): never;
  };
}): BindingFunction {
  return async (toolInput: unknown) => {
    const context = getBindingContext();
    let interruptSignal: unknown;
    try {
      return await invokeHostTool({
        toolName,
        input: toolInput,
        tools: input.tools,
        baseExecutionOptions: {
          ...baseExecutionOptions,
          abortSignal: context.abortSignal,
          interrupt: (payload): never => {
            try {
              return context.interrupt(payload);
            } catch (error) {
              interruptSignal = error;
              throw error;
            }
          },
          ...(context.resume !== undefined ? { resume: context.resume } : {}),
        },
        toolCallId: `${input.toolExecutionOptions?.toolCallId ?? context.logicalRunId}:tool-${context.requestIndex}`,
      });
    } catch (error) {
      if (error === interruptSignal) {
        throw error;
      }
      if (error instanceof CodeModeToolError) {
        throw new RunBindingError(error.message, error.details);
      }
      throw new RunError('Host tool failed.', 'RUN_HOST_BINDING_ERROR');
    }
  };
}

function createBaseExecutionOptions(
  input: RunCodeModeInput,
): CodeModeToolExecutionOptions & { interrupt(payload: unknown): never } {
  const options = input.toolExecutionOptions;
  const context = options?.context ?? options?.experimental_context;
  const experimentalContext = options?.experimental_context ?? options?.context;
  return {
    toolCallId: options?.toolCallId ?? 'code-mode',
    messages: options?.messages ?? [],
    interrupt: () => {
      throw new CodeModeError(
        'Interrupt is unavailable outside a runtime binding.',
        'CODE_MODE_PROTOCOL_ERROR',
      );
    },
    ...(options?.abortSignal !== undefined
      ? { abortSignal: options.abortSignal }
      : {}),
    ...(context !== undefined ? { context } : {}),
    ...(experimentalContext !== undefined
      ? { experimental_context: experimentalContext }
      : {}),
  };
}

function toRunLimits(input: RunCodeModeInput) {
  const policy = normalizeOptions(input.options);
  return {
    timeoutMs: policy.timeoutMs,
    memoryLimitBytes: policy.memoryLimitBytes,
    maxStackSizeBytes: policy.maxStackSizeBytes,
    maxResultBytes: policy.maxResultBytes,
    maxConsoleOutputBytes: policy.maxConsoleOutputBytes,
    maxSourceBytes: policy.maxSourceBytes,
    maxBindingArgumentsBytes: policy.maxToolInputBytes,
    maxBindingOutputBytes: policy.maxToolOutputBytes,
    maxBridgeRequests: policy.maxBridgeRequests,
    maxInFlightBridgeRequests: policy.maxInFlightBridgeRequests,
    maxContinuationBytes: policy.maxContinuationBytes,
  };
}

function toCodeModeError(error: unknown, availableTools: string[]): unknown {
  if (!RunError.isInstance(error)) {
    return error;
  }
  const details = error.details as Record<string, unknown> | undefined;
  let result: CodeModeError;
  switch (error.code) {
    case 'RUN_TIMEOUT':
      result = new CodeModeTimeoutError(Number(details?.timeoutMs ?? 0));
      break;
    case 'RUN_ABORTED':
      result = new CodeModeAbortedError();
      break;
    case 'RUN_CONCURRENCY_LIMIT':
      result = new CodeModeConcurrencyError(Number(details?.maxWorkers ?? 0));
      break;
    case 'RUN_SOURCE_TOO_LARGE':
      result = new CodeModeSourceTooLargeError(
        Number(details?.bytes ?? 0),
        Number(details?.maxBytes ?? 0),
      );
      break;
    case 'RUN_BRIDGE_LIMIT':
      result = new CodeModeBridgeLimitError(error.message, error.details);
      break;
    case 'RUN_DETACHED_BRIDGE_REQUEST':
      result = new CodeModeDetachedBridgeRequestError(
        error.message,
        error.details,
      );
      break;
    case 'RUN_PROTOCOL_ERROR':
      result = new CodeModeProtocolError(error.message, error.details);
      break;
    case 'RUN_BINDING_ERROR':
      {
        const bindingName =
          typeof details?.bindingName === 'string'
            ? details.bindingName
            : /^Unknown binding: (tools\..+)$/u.exec(error.message)?.[1];
        if (bindingName?.startsWith('tools.')) {
          const toolName = bindingName.slice('tools.'.length);
          result = new CodeModeToolError(`Unknown tool: ${toolName}`, {
            toolName,
            availableTools,
          });
          break;
        }
      }
      result = new CodeModeToolError(error.message, error.details);
      break;
    default: {
      const code =
        error.code === 'RUN_HOST_BINDING_ERROR'
          ? 'CODE_MODE_HOST_TOOL_ERROR'
          : error.code.replace(/^RUN_/u, 'CODE_MODE_');
      result = new CodeModeError(error.message, code, error.details);
      break;
    }
  }
  result.stack = replaceStackHeader(error.stack, result);
  return result;
}

function replaceStackHeader(stack: string | undefined, error: Error): string {
  const header = `${error.name}: ${error.message}`;
  if (stack === undefined) return header;
  const firstFrame = stack.indexOf('\n');
  return firstFrame === -1 ? header : `${header}${stack.slice(firstFrame)}`;
}
