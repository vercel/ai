import { asSchema } from 'ai';
import { CodeModeToolError } from './errors.js';
import type { CodeModeToolExecutionOptions, CodeModeToolSet } from './types.js';
import {
  assertJsonSerializable,
  toJsonPayload,
} from './utils/serialization.js';

export async function invokeHostTool({
  toolName,
  inputJson,
  tools,
  baseExecutionOptions,
  maxToolInputBytes,
  maxToolOutputBytes,
  toolCallId,
}: {
  toolName: string;
  inputJson: string;
  tools: CodeModeToolSet;
  baseExecutionOptions: CodeModeToolExecutionOptions;
  maxToolInputBytes: number;
  maxToolOutputBytes: number;
  toolCallId: string;
}): Promise<string> {
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

  const input = inputJson === '' ? undefined : JSON.parse(inputJson);
  assertJsonSerializable(input, maxToolInputBytes, `Tool "${toolName}" input`);

  const validation = await validateToolInput(hostTool.inputSchema, input);
  if (!validation.success) {
    throw new CodeModeToolError(
      `Invalid input for tool "${toolName}": ${validation.error.message}`,
      { toolName, input, cause: validation.error.message },
    );
  }

  const executionOptions: CodeModeToolExecutionOptions = {
    ...baseExecutionOptions,
    toolCallId,
  };

  if (await requiresApproval(hostTool, validation.value, executionOptions)) {
    throw new CodeModeToolError(
      `Tool "${toolName}" requires approval, which code mode does not support yet.`,
      { toolName, input: validation.value, toolCallId },
    );
  }

  const output = await executeHostTool(hostTool.execute.bind(hostTool), {
    input: validation.value,
    options: executionOptions,
  });
  return toJsonPayload(output, maxToolOutputBytes, `Tool "${toolName}" output`);
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
