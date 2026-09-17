import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  createRunner,
  createSignedContinuationCodec,
  getHostFunctionContext,
  RunError,
  type HostFunctions,
  type RunInterruption,
  type RunLimits,
  type RunResolution,
} from 'run';
import {
  isCodeModeApprovalInterruptPayload,
  normalizeApprovalResolution,
} from './approval.js';
import {
  resolveCodeModeContinuationSecurity,
  signCodeModeContinuation,
  verifyCodeModeContinuation,
} from './continuation-capability.js';
import {
  CodeModeAbortedError,
  CodeModeBridgeLimitError,
  CodeModeConcurrencyError,
  CodeModeDetachedBridgeRequestError,
  CodeModeError,
  CodeModeProtocolError,
  CodeModeSourceTooLargeError,
  CodeModeTimeoutError,
  CodeModeToolApprovalDeniedError,
} from './errors.js';
import { invokeHostTool } from './tool-invocation.js';
import type {
  CodeModeContinuation,
  CodeModeExecutionPolicy,
  CodeModeInterrupt,
  CodeModeInterruptExecutionContext,
  CodeModeInterruptPayload,
  CodeModePendingInterruption,
  CodeModePendingResolution,
  CodeModeToolExecutionOptions,
  RunCodeModeInput,
} from './types.js';
import { fromJsonPayload, toJsonPayload } from './utils/serialization.js';

const SOURCE_LINE_OFFSET = 1;
const MAX_RUN_LIMIT = 2_147_483_647;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const DEFAULT_STACK_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RESULT_BYTES = 1024 * 1024;
const DEFAULT_MAX_CONSOLE_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_MAX_SOURCE_BYTES = 256 * 1024;
const DEFAULT_MAX_TOOL_INPUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_TOOL_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_BRIDGE_REQUESTS = 256;
const DEFAULT_MAX_IN_FLIGHT_BRIDGE_REQUESTS = 32;

let invocationCounter = 0;

/**
 * Runs one code-mode invocation directly without wrapping it as an AI SDK tool.
 *
 * The source is executed in a fresh QuickJS context with the provided host tools
 * and execution limits.
 *
 * @param input - Source code, host tools, forwarded tool execution options, and code-mode options.
 * @returns The JSON-serializable value returned by the sandboxed program.
 */
export async function runCodeMode(input: RunCodeModeInput): Promise<unknown> {
  const policy = resolveExecutionPolicy(input.options?.executionPolicy);
  assertSourceSize(input.js, policy.maxSourceBytes);

  const toolNames = Object.keys(input.tools).sort();
  const continuationState = prepareContinuation(
    input,
    toolNames,
    policy.maxToolOutputBytes,
  );
  if (continuationState.nextInterrupt !== undefined) {
    return continuationState.nextInterrupt;
  }

  const outerToolCallId =
    input.toolExecutionOptions?.toolCallId ??
    input.continuation?.outerToolCallId ??
    `code-mode-${++invocationCounter}`;
  const source = createCodeModeSource(input.js, toolNames);
  const codeModeErrors: CodeModeError[] = [];
  const hostFunctions = createHostFunctions({
    codeModeErrors,
    input,
    outerToolCallId,
    policy,
    toolNames,
  });
  const continuationSecurity = resolveCodeModeContinuationSecurity(
    input.options?.continuationSecurity,
  );
  const runner = createRunner({
    continuationAudience: '@ai-sdk/code-mode/v2',
    continuationCodec: createSignedContinuationCodec({
      maxAgeMs: continuationSecurity.maxAgeMs,
      secret: createHash('sha256')
        .update(continuationSecurity.signingKey)
        .digest(),
    }),
  });

  try {
    const result = await runner.run({
      source,
      hostFunctions,
      limits: toRunLimits(policy, source, input.js),
      continuationContext: { outerToolCallId, toolNames },
      ...(input.toolExecutionOptions?.abortSignal === undefined
        ? {}
        : { abortSignal: input.toolExecutionOptions.abortSignal }),
      ...(continuationState.token === undefined
        ? {}
        : { continuation: continuationState.token }),
      ...(continuationState.resolutions === undefined
        ? {}
        : { resolutions: continuationState.resolutions }),
    });

    if (result.status === 'completed') {
      return fromJsonPayload(
        toJsonPayload(result.value, policy.maxResultBytes, 'Code mode result'),
      );
    }

    const pendingInterruptions = toPendingInterruptions({
      interruptions: result.interruptions,
      outerToolCallId,
      toolNames,
    });
    const continuation = signCodeModeContinuation(
      {
        version: 2,
        js: input.js,
        outerToolCallId,
        toolNames,
        token: result.continuation,
        pendingInterruptions,
        resolutions: [],
      },
      continuationSecurity,
    );
    return toCodeModeInterrupt(continuation, 0);
  } catch (error) {
    const preserved = findPreservedCodeModeError(error, codeModeErrors);
    if (preserved !== undefined) {
      throw translateSourceStack(preserved);
    }
    throw translateSourceStack(toCodeModeRuntimeError(error));
  }
}

interface ResolvedExecutionPolicy {
  timeoutMs: number;
  memoryLimitBytes: number;
  maxStackSizeBytes: number;
  maxResultBytes: number;
  maxConsoleOutputBytes: number;
  maxSourceBytes: number;
  maxToolInputBytes: number;
  maxToolOutputBytes: number;
  maxBridgeRequests: number;
  maxInFlightBridgeRequests: number;
}

function resolveExecutionPolicy(
  policy: CodeModeExecutionPolicy = {},
): ResolvedExecutionPolicy {
  return {
    timeoutMs: policy.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    memoryLimitBytes: policy.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES,
    maxStackSizeBytes: policy.maxStackSizeBytes ?? DEFAULT_STACK_LIMIT_BYTES,
    maxResultBytes: policy.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES,
    maxConsoleOutputBytes:
      policy.maxConsoleOutputBytes ?? DEFAULT_MAX_CONSOLE_OUTPUT_BYTES,
    maxSourceBytes: policy.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES,
    maxToolInputBytes: policy.maxToolInputBytes ?? DEFAULT_MAX_TOOL_INPUT_BYTES,
    maxToolOutputBytes:
      policy.maxToolOutputBytes ?? DEFAULT_MAX_TOOL_OUTPUT_BYTES,
    maxBridgeRequests: policy.maxBridgeRequests ?? DEFAULT_MAX_BRIDGE_REQUESTS,
    maxInFlightBridgeRequests:
      policy.maxInFlightBridgeRequests ?? DEFAULT_MAX_IN_FLIGHT_BRIDGE_REQUESTS,
  };
}

function assertSourceSize(source: string, maxBytes: number): void {
  if (!isValidRunLimit(maxBytes)) {
    return;
  }
  const bytes = Buffer.byteLength(source);
  if (bytes > maxBytes) {
    throw new CodeModeSourceTooLargeError(bytes, maxBytes);
  }
}

function createCodeModeSource(js: string, toolNames: string[]): string {
  const bindings = Object.fromEntries(
    toolNames.map((toolName, index) => [toolName, `__codeMode.tool${index}`]),
  );
  const bindingSource = Object.entries(bindings)
    .map(([name, reference]) => `${JSON.stringify(name)}:${reference}`)
    .join(',');
  return `const __codeModeBindings={${bindingSource}};const tools=new Proxy(Object.create(null),{get(_target,name){const binding=__codeModeBindings[name];return typeof binding==="function"?(input)=>binding(input):(input)=>__codeMode.missing(String(name),input);}});const __codeModeResult=await(async()=>{\n${js}\n})();if(__codeModeResult===undefined)return undefined;return JSON.parse(JSON.stringify(__codeModeResult));`;
}

function createHostFunctions({
  codeModeErrors,
  input,
  outerToolCallId,
  policy,
  toolNames,
}: {
  codeModeErrors: CodeModeError[];
  input: RunCodeModeInput;
  outerToolCallId: string;
  policy: ResolvedExecutionPolicy;
  toolNames: string[];
}): HostFunctions {
  const group: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  for (const [index, toolName] of toolNames.entries()) {
    group[`tool${index}`] = async (toolInput: unknown) =>
      await invokeCodeModeTool({
        codeModeErrors,
        input,
        outerToolCallId,
        policy,
        toolInput,
        toolName,
      });
  }
  group.missing = async (toolName: unknown, toolInput: unknown) =>
    await invokeCodeModeTool({
      codeModeErrors,
      input,
      outerToolCallId,
      policy,
      toolInput,
      toolName: String(toolName),
    });
  return { __codeMode: group } as HostFunctions;
}

async function invokeCodeModeTool({
  codeModeErrors,
  input,
  outerToolCallId,
  policy,
  toolInput,
  toolName,
}: {
  codeModeErrors: CodeModeError[];
  input: RunCodeModeInput;
  outerToolCallId: string;
  policy: ResolvedExecutionPolicy;
  toolInput: unknown;
  toolName: string;
}): Promise<unknown> {
  const context = getHostFunctionContext();
  const toolCallId = `${outerToolCallId}:tool-${context.requestIndex}`;
  const forwardedContext =
    input.toolExecutionOptions?.context ??
    input.toolExecutionOptions?.experimental_context;
  const forwardedExperimentalContext =
    input.toolExecutionOptions?.experimental_context ??
    input.toolExecutionOptions?.context;
  const baseExecutionOptions: CodeModeToolExecutionOptions = {
    toolCallId: outerToolCallId,
    messages: input.toolExecutionOptions?.messages ?? [],
    abortSignal: context.abortSignal,
    ...(forwardedContext === undefined ? {} : { context: forwardedContext }),
    ...(forwardedExperimentalContext === undefined
      ? {}
      : { experimental_context: forwardedExperimentalContext }),
  };

  let codeModeInterrupt: CodeModeInterruptExecutionContext | undefined;
  let skipApproval = false;
  if (context.resume !== undefined) {
    const payload = assertInterruptPayload(context.resume.payload);
    if (isCodeModeApprovalInterruptPayload(payload)) {
      const decision = normalizeApprovalResolution(context.resume.resolution);
      if (!decision.approved) {
        throw new CodeModeToolApprovalDeniedError(
          toolName,
          toolInput,
          toolCallId,
          decision.reason,
        );
      }
      skipApproval = true;
    } else {
      codeModeInterrupt = {
        interruptId: `${toolCallId}:interrupt`,
        payload,
        resolution: context.resume.resolution,
      };
    }
  }

  try {
    const inputJson = toJsonPayload(
      toolInput,
      policy.maxToolInputBytes,
      `Tool "${toolName}" input`,
    );
    const outcome = await invokeHostTool({
      toolName,
      inputJson,
      tools: input.tools,
      baseExecutionOptions,
      codeModeOptions: input.options ?? {},
      maxToolInputBytes: policy.maxToolInputBytes,
      maxToolOutputBytes: policy.maxToolOutputBytes,
      toolCallId,
      ...(codeModeInterrupt === undefined ? {} : { codeModeInterrupt }),
      skipApproval,
    });
    if (outcome.type === 'interrupted') {
      return context.interrupt(outcome.payload);
    }
    return fromJsonPayload(outcome.valueJson);
  } catch (error) {
    if (error instanceof CodeModeError) {
      codeModeErrors.push(error);
      throw new RunError(error.message, error.code, error.details);
    }
    if (
      RunError.isInstance(error) ||
      (error instanceof Error && error.name === 'HostFunctionInterruptSignal')
    ) {
      throw error;
    }
    throw new RunError('Host tool failed.', 'CODE_MODE_HOST_TOOL_ERROR');
  }
}

function assertInterruptPayload(value: unknown): CodeModeInterruptPayload {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as { kind?: unknown }).kind !== 'string'
  ) {
    throw new CodeModeProtocolError(
      'Code mode interruption payload is malformed.',
    );
  }
  return value as CodeModeInterruptPayload;
}

function toRunLimits(
  policy: ResolvedExecutionPolicy,
  source: string,
  userSource: string,
): RunLimits {
  return {
    timeoutMs: policy.timeoutMs,
    memoryLimitBytes: policy.memoryLimitBytes,
    maxStackSizeBytes: policy.maxStackSizeBytes,
    maxResultBytes: expandedSerializationLimit(policy.maxResultBytes),
    maxConsoleOutputBytes: policy.maxConsoleOutputBytes,
    maxSourceBytes: withSerializationOverhead(
      policy.maxSourceBytes,
      Buffer.byteLength(source) - Buffer.byteLength(userSource),
    ),
    maxHostFunctionArgumentsBytes: expandedSerializationLimit(
      policy.maxToolInputBytes,
    ),
    maxHostFunctionOutputBytes: expandedSerializationLimit(
      policy.maxToolOutputBytes,
    ),
    maxBridgeRequests: policy.maxBridgeRequests,
    maxInFlightBridgeRequests: policy.maxInFlightBridgeRequests,
  };
}

function expandedSerializationLimit(value: number): number {
  if (!isValidRunLimit(value)) {
    return value;
  }
  return Math.min(MAX_RUN_LIMIT, Math.max(4096, value * 2 + 1024));
}

function withSerializationOverhead(value: number, overhead: number): number {
  return isValidRunLimit(value)
    ? Math.min(MAX_RUN_LIMIT, value + overhead)
    : value;
}

function isValidRunLimit(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_RUN_LIMIT;
}

function prepareContinuation(
  input: RunCodeModeInput,
  toolNames: string[],
  maxToolOutputBytes: number,
): {
  token?: string;
  resolutions?: RunResolution[];
  nextInterrupt?: CodeModeInterrupt;
} {
  if (input.continuation === undefined) {
    if (input.interruptResolution !== undefined) {
      throw new CodeModeProtocolError(
        'A code-mode interrupt resolution was provided without continuation state.',
      );
    }
    return {};
  }

  verifyCodeModeContinuation(
    input.continuation,
    input.options?.continuationSecurity,
  );
  if (input.continuation.js !== input.js) {
    throw new CodeModeProtocolError(
      'Code mode continuation source does not match the resumed source.',
    );
  }
  if (!stringArraysEqual(input.continuation.toolNames, toolNames)) {
    throw new CodeModeProtocolError(
      'Code mode continuation tool names do not match the resumed tools.',
    );
  }
  if (input.interruptResolution === undefined) {
    throw new CodeModeProtocolError(
      'A code-mode continuation requires an interrupt resolution.',
    );
  }

  const resolutionIndex = input.continuation.resolutions.length;
  const pending = input.continuation.pendingInterruptions[resolutionIndex];
  if (
    pending === undefined ||
    pending.interruptId !== input.interruptResolution.interruptId
  ) {
    throw new CodeModeProtocolError(
      'Interrupt resolution does not match the next pending code-mode interruption.',
      { interruptId: input.interruptResolution.interruptId },
    );
  }
  const resolutionValue = normalizeResolutionForPending(
    pending,
    input.interruptResolution.resolution,
    maxToolOutputBytes,
  );
  const resolutions: CodeModePendingResolution[] = [
    ...input.continuation.resolutions,
    {
      runInterruptionId: pending.runInterruptionId,
      value: resolutionValue,
    },
  ];

  if (resolutions.length < input.continuation.pendingInterruptions.length) {
    const continuation = signCodeModeContinuation(
      {
        ...withoutAuth(input.continuation),
        resolutions,
      },
      resolveCodeModeContinuationSecurity(input.options?.continuationSecurity),
    );
    return {
      nextInterrupt: toCodeModeInterrupt(continuation, resolutions.length),
    };
  }

  assertNoDeniedApproval(input.continuation.pendingInterruptions, resolutions);
  return {
    token: input.continuation.token,
    resolutions: resolutions.map(resolution => ({
      interruptionId: resolution.runInterruptionId,
      value: resolution.value,
    })),
  };
}

function normalizeResolutionForPending(
  pending: CodeModePendingInterruption,
  resolution: unknown,
  maxToolOutputBytes: number,
): unknown {
  return isCodeModeApprovalInterruptPayload(pending.payload)
    ? normalizeApprovalResolution(resolution)
    : fromJsonPayload(
        toJsonPayload(
          resolution,
          maxToolOutputBytes,
          `Resolution "${pending.interruptId}"`,
        ),
      );
}

function assertNoDeniedApproval(
  pendingInterruptions: CodeModePendingInterruption[],
  resolutions: CodeModePendingResolution[],
): void {
  for (const [index, pending] of pendingInterruptions.entries()) {
    if (!isCodeModeApprovalInterruptPayload(pending.payload)) {
      continue;
    }
    const decision = normalizeApprovalResolution(resolutions[index]?.value);
    if (!decision.approved) {
      throw new CodeModeToolApprovalDeniedError(
        pending.toolName,
        pending.input,
        pending.toolCallId,
        decision.reason,
      );
    }
  }
}

function withoutAuth(
  continuation: CodeModeContinuation,
): Omit<CodeModeContinuation, 'auth'> {
  const { auth: _auth, ...unsigned } = continuation;
  return unsigned;
}

function toPendingInterruptions({
  interruptions,
  outerToolCallId,
  toolNames,
}: {
  interruptions: RunInterruption[];
  outerToolCallId: string;
  toolNames: string[];
}): CodeModePendingInterruption[] {
  return interruptions.map(interruption => {
    const requestIndex = interruptionIndex(interruption.id);
    const toolName = toolNameForInterruption(interruption, toolNames);
    const toolCallId = `${outerToolCallId}:tool-${requestIndex}`;
    return {
      runInterruptionId: interruption.id,
      interruptId: `${toolCallId}:interrupt`,
      toolName,
      toolCallId,
      input:
        interruption.hostFunctionName === '__codeMode.missing'
          ? interruption.arguments[1]
          : interruption.arguments[0],
      payload: assertInterruptPayload(interruption.payload),
    };
  });
}

function interruptionIndex(interruptionId: string): number {
  const match = /^interrupt-(\d+)$/u.exec(interruptionId);
  if (match === null) {
    throw new CodeModeProtocolError(
      `Run returned malformed interruption id "${interruptionId}".`,
    );
  }
  return Number(match[1]);
}

function toolNameForInterruption(
  interruption: RunInterruption,
  toolNames: string[],
): string {
  if (interruption.hostFunctionName === '__codeMode.missing') {
    return String(interruption.arguments[0]);
  }
  const match = /^__codeMode\.tool(\d+)$/u.exec(interruption.hostFunctionName);
  const toolName = match === null ? undefined : toolNames[Number(match[1])];
  if (toolName === undefined) {
    throw new CodeModeProtocolError(
      `Run returned an unknown code-mode host function "${interruption.hostFunctionName}".`,
    );
  }
  return toolName;
}

function toCodeModeInterrupt(
  continuation: CodeModeContinuation,
  index: number,
): CodeModeInterrupt {
  const pending = continuation.pendingInterruptions[index];
  if (pending === undefined) {
    throw new CodeModeProtocolError(
      'Code mode continuation has no pending interruption at the requested index.',
    );
  }
  return {
    type: 'code-mode-interrupt',
    interruptId: pending.interruptId,
    toolName: pending.toolName,
    toolCallId: pending.toolCallId,
    outerToolCallId: continuation.outerToolCallId,
    input: structuredClone(pending.input),
    payload: structuredClone(pending.payload),
    continuation,
  };
}

function stringArraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function findPreservedCodeModeError(
  error: unknown,
  errors: CodeModeError[],
): CodeModeError | undefined {
  if (!RunError.isInstance(error)) {
    return undefined;
  }
  return errors.find(candidate => candidate.code === error.code);
}

function toCodeModeRuntimeError(error: unknown): unknown {
  if (error instanceof TypeError) {
    error.message = translateLimitPath(error.message);
  }
  if (
    error instanceof Error &&
    error.name === 'SyntaxError' &&
    !/syntax|unexpected|expression expected/iu.test(error.message)
  ) {
    error.message = `Syntax error: ${error.message}`;
  }
  if (!RunError.isInstance(error)) {
    return error;
  }
  const details = error.details as Record<string, unknown> | undefined;
  switch (error.code) {
    case 'RUN_ABORTED':
      return copyStack(new CodeModeAbortedError(), error);
    case 'RUN_TIMEOUT':
      return copyStack(
        new CodeModeTimeoutError(Number(details?.timeoutMs ?? 0)),
        error,
      );
    case 'RUN_CONCURRENCY_LIMIT':
      return copyStack(
        new CodeModeConcurrencyError(Number(details?.maxWorkers ?? 0)),
        error,
      );
    case 'RUN_SOURCE_TOO_LARGE':
      return copyStack(
        new CodeModeSourceTooLargeError(
          Number(details?.bytes ?? 0),
          Number(details?.maxBytes ?? 0),
        ),
        error,
      );
    case 'RUN_BRIDGE_LIMIT':
      return copyStack(
        new CodeModeBridgeLimitError(error.message, error.details),
        error,
      );
    case 'RUN_DETACHED_BRIDGE_REQUEST':
      return copyStack(
        new CodeModeDetachedBridgeRequestError(error.message, error.details),
        error,
      );
    case 'RUN_PROTOCOL_ERROR':
      return copyStack(
        new CodeModeProtocolError(error.message, error.details),
        error,
      );
    default:
      return error;
  }
}

function translateLimitPath(message: string): string {
  const paths: Record<string, string> = {
    'limits.timeoutMs': 'executionPolicy.timeoutMs',
    'limits.memoryLimitBytes': 'executionPolicy.memoryLimitBytes',
    'limits.maxStackSizeBytes': 'executionPolicy.maxStackSizeBytes',
    'limits.maxResultBytes': 'executionPolicy.maxResultBytes',
    'limits.maxConsoleOutputBytes': 'executionPolicy.maxConsoleOutputBytes',
    'limits.maxSourceBytes': 'executionPolicy.maxSourceBytes',
    'limits.maxHostFunctionArgumentsBytes': 'executionPolicy.maxToolInputBytes',
    'limits.maxHostFunctionOutputBytes': 'executionPolicy.maxToolOutputBytes',
    'limits.maxBridgeRequests': 'executionPolicy.maxBridgeRequests',
    'limits.maxInFlightBridgeRequests':
      'executionPolicy.maxInFlightBridgeRequests',
  };
  for (const [runPath, codeModePath] of Object.entries(paths)) {
    if (message.includes(runPath)) {
      return message.replace(runPath, codeModePath);
    }
  }
  return message;
}

function copyStack<T extends Error>(target: T, source: Error): T {
  if (source.stack !== undefined) {
    target.stack = source.stack;
  }
  return target;
}

function translateSourceStack<T>(error: T): T {
  if (!(error instanceof Error) || error.stack === undefined) {
    return error;
  }
  error.stack = error.stack.replaceAll(
    /run\.js:(\d+):(\d+)/gu,
    (_match, line: string, column: string) =>
      `code-mode.js:${Math.max(1, Number(line) - SOURCE_LINE_OFFSET)}:${column}`,
  );
  return error;
}
