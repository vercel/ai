import type { ToolSet } from '@ai-sdk/provider-utils';
import { ToolCallNotExecutedError } from '../error/tool-call-not-executed-error';
import type { FinishReason } from '../types/language-model';
import { getOwn } from '../util/get-own';
import type { TypedToolCall } from './tool-call';
import type { TypedToolError } from './tool-error';
import type { ToolOutput } from './tool-output';

/**
 * Creates the tool error for a tool call that was ready to execute but was
 * skipped because of the finish reason of the model call.
 */
export function createToolCallNotExecutedError<TOOLS extends ToolSet>({
  toolCall,
  tools,
  finishReason,
}: {
  toolCall: TypedToolCall<TOOLS>;
  tools: TOOLS | undefined;
  finishReason: FinishReason;
}): TypedToolError<TOOLS> {
  return {
    type: 'tool-error',
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input,
    error: new ToolCallNotExecutedError({
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      finishReason,
    }),
    dynamic: getOwn(tools, toolCall.toolName)?.type === 'dynamic',
    ...(toolCall.providerMetadata != null
      ? { providerMetadata: toolCall.providerMetadata }
      : {}),
    ...(toolCall.toolMetadata != null
      ? { toolMetadata: toolCall.toolMetadata }
      : {}),
  } as TypedToolError<TOOLS>;
}

export function hasToolCallNotExecutedError<TOOLS extends ToolSet>(
  toolOutputs: Array<ToolOutput<TOOLS>>,
): boolean {
  return toolOutputs.some(
    toolOutput =>
      toolOutput.type === 'tool-error' &&
      ToolCallNotExecutedError.isInstance(toolOutput.error),
  );
}
