import { asSchema } from 'ai';
import { CODE_MODE_TOOL_APPROVAL_KIND } from './approval.js';
import {
  CodeModeProtocolError,
  CodeModeToolApprovalDeniedError,
  CodeModeToolApprovalRequiredError,
  CodeModeToolError,
} from './errors.js';
import type {
  CodeModeInterruptExecutionContext,
  CodeModeInterruptPayload,
  CodeModeOptions,
  CodeModeToolExecutionOptions,
  CodeModeToolSet,
} from './types.js';
import {
  assertJsonSerializable,
  fromJsonPayload,
  toJsonPayload,
} from './utils/serialization.js';

export type HostToolInvocationResult =
  | { type: 'success'; valueJson: string }
  | {
      type: 'interrupted';
      toolName: string;
      input: unknown;
      toolCallId: string;
      payload: CodeModeInterruptPayload;
    };

export async function invokeHostTool({
  toolName,
  inputJson,
  tools,
  baseExecutionOptions,
  codeModeOptions,
  maxToolInputBytes,
  maxToolOutputBytes,
  toolCallId,
  codeModeInterrupt,
  skipApproval = false,
}: {
  toolName: string;
  inputJson: string;
  tools: CodeModeToolSet;
  baseExecutionOptions: CodeModeToolExecutionOptions;
  codeModeOptions: CodeModeOptions;
  maxToolInputBytes: number;
  maxToolOutputBytes: number;
  toolCallId: string;
  codeModeInterrupt?: CodeModeInterruptExecutionContext;
  skipApproval?: boolean;
}): Promise<HostToolInvocationResult> {
  throwIfAborted(baseExecutionOptions.abortSignal);

  const hostTool = tools[toolName];
  if (!hostTool) {
    throw new CodeModeToolError(`Unknown tool: ${toolName}`, {
      toolName,
      availableTools: Object.keys(tools),
    });
  }
  if (hostTool.execute == null) {
    throw new CodeModeToolError(`Tool "${toolName}" does not have execute().`, {
      toolName,
    });
  }

  const input = fromJsonPayload(inputJson);
  assertJsonSerializable(input, maxToolInputBytes, `Tool "${toolName}" input`);

  const validation = await raceAgainstAbort(
    validateToolInput(hostTool.inputSchema, input),
    baseExecutionOptions.abortSignal,
  );
  if (!validation.success) {
    throw new CodeModeToolError(
      `Invalid input for tool "${toolName}": ${validation.error.message}`,
      { toolName, input, cause: validation.error.message },
    );
  }

  const executionOptions: CodeModeToolExecutionOptions = {
    ...baseExecutionOptions,
    toolCallId,
    ...(codeModeInterrupt !== undefined ? { codeModeInterrupt } : {}),
  };

  const needsApproval =
    !skipApproval &&
    (await raceAgainstAbort(
      requiresApproval(hostTool, validation.value, executionOptions),
      executionOptions.abortSignal,
    ));

  if (needsApproval) {
    if (codeModeOptions.approval?.mode === 'interrupt') {
      return {
        type: 'interrupted',
        toolName,
        input: validation.value,
        toolCallId,
        payload: { kind: CODE_MODE_TOOL_APPROVAL_KIND },
      };
    }

    const approval = await raceAgainstAbort(
      Promise.resolve(
        codeModeOptions.approval?.onApprovalRequired?.({
          toolName,
          input: validation.value,
          toolCallId,
        }),
      ),
      baseExecutionOptions.abortSignal,
    );
    if (approval === undefined) {
      throw new CodeModeToolApprovalRequiredError(
        toolName,
        validation.value,
        toolCallId,
      );
    }
    const approved =
      typeof approval === 'string'
        ? approval === 'approved'
        : approval?.approved;
    const reason = typeof approval === 'string' ? undefined : approval?.reason;
    if (typeof approved !== 'boolean') {
      throw new CodeModeProtocolError(
        `Tool "${toolName}" approval callback returned a malformed approval decision.`,
        { toolName, toolCallId },
      );
    }
    if (reason !== undefined && typeof reason !== 'string') {
      throw new CodeModeProtocolError(
        `Tool "${toolName}" approval callback returned a malformed approval reason.`,
        { toolName, toolCallId },
      );
    }
    if (!approved) {
      throw new CodeModeToolApprovalDeniedError(
        toolName,
        validation.value,
        toolCallId,
        reason,
      );
    }
  }

  const output = await raceAgainstAbort(
    executeHostTool(hostTool.execute.bind(hostTool), {
      input: validation.value,
      options: executionOptions,
    }),
    executionOptions.abortSignal,
  );
  return {
    type: 'success',
    valueJson: toJsonPayload(
      output,
      maxToolOutputBytes,
      `Tool "${toolName}" output`,
    ),
  };
}

async function requiresApproval(
  hostTool: CodeModeToolSet[string],
  input: unknown,
  options: CodeModeToolExecutionOptions,
): Promise<boolean> {
  if (hostTool.needsApproval == null) {
    return false;
  }
  if (typeof hostTool.needsApproval === 'boolean') {
    return hostTool.needsApproval;
  }
  return await hostTool.needsApproval(input as never, options as never);
}

async function validateToolInput(
  schema: CodeModeToolSet[string]['inputSchema'],
  input: unknown,
): Promise<
  { success: true; value: unknown } | { success: false; error: Error }
> {
  const normalizedSchema = asSchema(schema);
  if (normalizedSchema.validate === undefined) {
    return { success: true, value: input };
  }
  return await normalizedSchema.validate(input);
}

async function executeHostTool(
  execute: NonNullable<CodeModeToolSet[string]['execute']>,
  {
    input,
    options,
  }: {
    input: unknown;
    options: CodeModeToolExecutionOptions;
  },
): Promise<unknown> {
  const output = execute(input as never, options as never);
  if (isAsyncIterable(output)) {
    let finalOutput: unknown;
    for await (const part of output) {
      finalOutput = part;
    }
    return finalOutput;
  }
  return await output;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === 'function'
  );
}

async function raceAgainstAbort<T>(
  operation: Promise<T>,
  abortSignal: AbortSignal | undefined,
): Promise<T> {
  if (abortSignal === undefined) {
    return await operation;
  }
  throwIfAborted(abortSignal);

  let rejectOnAbort!: (reason?: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = reject;
  });
  const onAbort = () => {
    rejectOnAbort(abortReason(abortSignal));
  };

  abortSignal.addEventListener('abort', onAbort, { once: true });
  if (abortSignal.aborted) {
    onAbort();
  }

  try {
    return await Promise.race([operation, aborted]);
  } finally {
    abortSignal.removeEventListener('abort', onAbort);
  }
}

function throwIfAborted(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted) {
    throw abortReason(abortSignal);
  }
}

function abortReason(abortSignal: AbortSignal): unknown {
  return (
    abortSignal.reason ??
    new DOMException('The operation was aborted.', 'AbortError')
  );
}
