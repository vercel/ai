import {
  executeTool,
  safeValidateTypes,
  type ToolExecutionOptions,
} from '@ai-sdk/provider-utils';
import {
  CodeModeToolApprovalDeniedError,
  CodeModeToolApprovalRequiredError,
  CodeModeToolError,
} from './errors.js';
import { assertJsonSerializable, toJsonPayload } from './serialization.js';
import type { CodeModeOptions, CodeModeToolSet } from './types.js';

export async function invokeHostTool({
  toolName,
  inputJson,
  tools,
  baseExecutionOptions,
  codeModeOptions,
  maxToolInputBytes,
  maxToolOutputBytes,
  nextToolCallId,
}: {
  toolName: string;
  inputJson: string;
  tools: CodeModeToolSet;
  baseExecutionOptions: ToolExecutionOptions<any>;
  codeModeOptions: CodeModeOptions;
  maxToolInputBytes: number;
  maxToolOutputBytes: number;
  nextToolCallId: () => string;
}): Promise<string> {
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

  const validation = await safeValidateTypes({
    value: input,
    schema: tool.inputSchema,
  });
  if (!validation.success) {
    throw new CodeModeToolError(
      `Invalid input for tool "${toolName}": ${validation.error.message}`,
      { toolName, input, cause: validation.error.message },
    );
  }

  const toolCallId = nextToolCallId();
  const validatedInput = validation.value;

  const needsApproval = await resolveApproval(tool, validatedInput, {
    toolCallId,
    messages: baseExecutionOptions.messages,
    context: baseExecutionOptions.context,
  });

  if (needsApproval) {
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

    const approved =
      typeof approval === 'string'
        ? approval === 'approved'
        : approval.approved;
    const reason = typeof approval === 'string' ? undefined : approval.reason;
    if (!approved) {
      throw new CodeModeToolApprovalDeniedError(
        toolName,
        validatedInput,
        toolCallId,
        reason,
      );
    }
  }

  let output: unknown;
  const executionOptions: ToolExecutionOptions<any> = {
    ...baseExecutionOptions,
    toolCallId,
  };

  for await (const part of (executeTool as any)({
    tool,
    input: validatedInput,
    options: executionOptions,
  })) {
    output = part.output;
  }

  return toJsonPayload(output, maxToolOutputBytes, `Tool "${toolName}" output`);
}

async function resolveApproval(
  tool: CodeModeToolSet[string],
  input: unknown,
  options: Pick<
    ToolExecutionOptions<any>,
    'toolCallId' | 'messages' | 'context'
  >,
): Promise<boolean> {
  if (tool.needsApproval == null) {
    return false;
  }
  if (typeof tool.needsApproval === 'boolean') {
    return tool.needsApproval;
  }
  return await tool.needsApproval(input, options);
}
