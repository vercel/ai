import { asSchema } from 'ai';
import { CODE_MODE_TOOL_APPROVAL_KIND } from './approval.js';
import {
  CodeModeProtocolError,
  CodeModeToolApprovalDeniedError,
  CodeModeToolApprovalRequiredError,
  CodeModeToolError,
} from './errors.js';
import { isCodeModeHostInterruptSignal } from './host-interrupt.js';
import { assertJsonSerializable, toJsonPayload } from './serialization.js';
import type {
  CodeModeInterruptExecutionContext,
  CodeModeInterruptPayload,
  CodeModeOptions,
  CodeModeToolExecutionOptions,
  CodeModeToolSet,
} from './types.js';

export type HostToolInvocationResult =
  | {
      type: 'success';
      valueJson: string;
    }
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
  const tool = tools[toolName];
  if (!tool) {
    throw new CodeModeToolError(`Unknown tool: ${toolName}`, {
      toolName,
      availableTools: Object.keys(tools),
    });
  }
  if (tool.execute == null) {
    throw new CodeModeToolError(`Tool "${toolName}" does not have execute().`, {
      toolName,
    });
  }

  const input = inputJson === '' ? undefined : JSON.parse(inputJson);
  assertJsonSerializable(input, maxToolInputBytes, `Tool "${toolName}" input`);

  const validation = await validateToolInput(tool.inputSchema, input);
  if (!validation.success) {
    throw new CodeModeToolError(
      `Invalid input for tool "${toolName}": ${validation.error.message}`,
      { toolName, input, cause: validation.error.message },
    );
  }

  const validatedInput = validation.value;

  const needsApproval =
    !skipApproval &&
    (await resolveApproval(tool, validatedInput, {
      toolCallId,
      messages: baseExecutionOptions.messages,
      experimental_context: baseExecutionOptions.experimental_context,
      context: baseExecutionOptions.context,
    }));

  if (needsApproval) {
    if (codeModeOptions.approval?.mode === 'interrupt') {
      return {
        type: 'interrupted',
        toolName,
        input: validatedInput,
        toolCallId,
        payload: { kind: CODE_MODE_TOOL_APPROVAL_KIND },
      };
    }

    const approval = await codeModeOptions.approval?.onApprovalRequired?.({
      toolName,
      input: validatedInput,
      toolCallId,
    });

    if (approval === undefined) {
      throw new CodeModeToolApprovalRequiredError(
        toolName,
        validatedInput,
        toolCallId,
      );
    }

    if (
      typeof approval !== 'string' &&
      (typeof approval !== 'object' || approval === null)
    ) {
      throw new CodeModeProtocolError(
        `Tool "${toolName}" approval callback returned a malformed approval decision.`,
        { toolName, toolCallId },
      );
    }
    const approved =
      typeof approval === 'string'
        ? approval === 'approved'
        : approval.approved;
    const reason = typeof approval === 'string' ? undefined : approval.reason;
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
        validatedInput,
        toolCallId,
        reason,
      );
    }
  }

  const executionOptions: CodeModeToolExecutionOptions = {
    ...baseExecutionOptions,
    toolCallId,
    ...(codeModeInterrupt !== undefined ? { codeModeInterrupt } : {}),
  };

  let output: unknown;
  try {
    output = await executeHostTool(tool.execute.bind(tool), {
      input: validatedInput,
      options: executionOptions,
    });
  } catch (error) {
    if (isCodeModeHostInterruptSignal(error)) {
      const payloadJson = toJsonPayload(
        error.payload,
        maxToolOutputBytes,
        `Tool "${toolName}" interrupt payload`,
      );
      const payload = payloadJson === '' ? undefined : JSON.parse(payloadJson);
      return {
        type: 'interrupted',
        toolName,
        input: validatedInput,
        toolCallId,
        payload: payload as CodeModeInterruptPayload,
      };
    }
    throw error;
  }

  return {
    type: 'success',
    valueJson: toJsonPayload(
      output,
      maxToolOutputBytes,
      `Tool "${toolName}" output`,
    ),
  };
}

async function resolveApproval(
  tool: CodeModeToolSet[string],
  input: unknown,
  options: Pick<
    CodeModeToolExecutionOptions,
    'toolCallId' | 'messages' | 'experimental_context' | 'context'
  >,
): Promise<boolean> {
  if (tool.needsApproval == null) {
    return false;
  }
  if (typeof tool.needsApproval === 'boolean') {
    return tool.needsApproval;
  }
  return await tool.needsApproval(input as never, options as never);
}

async function validateToolInput(
  schema: CodeModeToolSet[string]['inputSchema'],
  input: unknown,
): Promise<
  | {
      success: true;
      value: unknown;
    }
  | {
      success: false;
      error: Error;
    }
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
