import { asSchema } from 'ai';
import { CodeModeToolError } from './errors.js';
import type { CodeModeToolExecutionOptions, CodeModeToolSet } from './types.js';

export async function invokeHostTool({
  toolName,
  input,
  tools,
  baseExecutionOptions,
  toolCallId,
}: {
  toolName: string;
  input: unknown;
  tools: CodeModeToolSet;
  baseExecutionOptions: CodeModeToolExecutionOptions & {
    interrupt(payload: unknown): never;
  };
  toolCallId: string;
}): Promise<unknown> {
  throwIfAborted(baseExecutionOptions.abortSignal);

  const hostTool = Object.hasOwn(tools, toolName) ? tools[toolName] : undefined;
  if (hostTool === undefined) {
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

  const executionOptions: CodeModeToolExecutionOptions & {
    interrupt(payload: unknown): never;
  } = {
    ...baseExecutionOptions,
    toolCallId,
  };
  const originalInterrupt = executionOptions.interrupt;
  const originalResume = executionOptions.resume;
  const resumePayload = originalResume?.payload;
  let resumeStage: 'approval' | 'host' | undefined;
  let approvalChecked = false;

  if (isHostInterruptEnvelope(resumePayload)) {
    if (
      resumePayload.toolName !== toolName ||
      resumePayload.toolCallId !== toolCallId
    ) {
      throw new CodeModeToolError(
        `Interruption does not match tool "${toolName}".`,
        { toolName, toolCallId },
      );
    }
    resumeStage = resumePayload.stage;
    approvalChecked = resumePayload.approvalChecked;
    executionOptions.resume = {
      ...executionOptions.resume!,
      payload: resumePayload.payload,
    };
  }

  if (resumeStage === 'approval') {
    if (originalResume?.resolution !== true) {
      throw new CodeModeToolError(`Tool "${toolName}" approval was denied.`, {
        toolName,
        input: validation.value,
        toolCallId,
      });
    }
    approvalChecked = true;
    delete executionOptions.resume;
  } else if (!approvalChecked) {
    if (
      await raceAgainstAbort(
        requiresApproval(hostTool, validation.value, executionOptions),
        executionOptions.abortSignal,
      )
    ) {
      originalInterrupt(
        createInterruptEnvelope({
          stage: 'approval',
          approvalChecked: false,
          toolName,
          toolCallId,
          payload: {
            kind: 'tool-approval',
            toolName,
            input: validation.value,
            toolCallId,
          },
        }),
      );
    }
    approvalChecked = true;
  }

  executionOptions.interrupt = payload =>
    originalInterrupt(
      createInterruptEnvelope({
        stage: 'host',
        approvalChecked,
        toolName,
        toolCallId,
        payload,
      }),
    );

  const output = await raceAgainstAbort(
    executeHostTool(hostTool.execute.bind(hostTool), {
      input: validation.value,
      options: executionOptions,
    }),
    executionOptions.abortSignal,
  );
  return output;
}

export function unwrapCodeModeInterruptPayload(value: unknown): unknown {
  return isHostInterruptEnvelope(value) ? value.payload : value;
}

function isHostInterruptEnvelope(value: unknown): value is {
  kind: 'code-mode-interrupt-v1';
  stage: 'approval' | 'host';
  approvalChecked: boolean;
  toolName: string;
  toolCallId: string;
  payload: unknown;
} {
  return (
    isPlainRecord(value) &&
    hasExactKeys(value, [
      'approvalChecked',
      'kind',
      'payload',
      'stage',
      'toolCallId',
      'toolName',
    ]) &&
    value.kind === 'code-mode-interrupt-v1' &&
    (value.stage === 'approval' || value.stage === 'host') &&
    typeof value.approvalChecked === 'boolean' &&
    typeof value.toolName === 'string' &&
    typeof value.toolCallId === 'string'
  );
}

function createInterruptEnvelope(input: {
  stage: 'approval' | 'host';
  approvalChecked: boolean;
  toolName: string;
  toolCallId: string;
  payload: unknown;
}) {
  return { kind: 'code-mode-interrupt-v1' as const, ...input };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
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
