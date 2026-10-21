import { isExecutableTool, type ToolSet } from '@ai-sdk/provider-utils';
import { ToolCallNotExecutedError } from '../error/tool-call-not-executed-error';
import type { FinishReason } from '../types/language-model';
import { getOwn } from '../util/get-own';
import type { TypedToolCall } from './tool-call';
import type { TypedToolError } from './tool-error';

export function createToolCallNotExecutedOutput<TOOLS extends ToolSet>({
  toolCall,
  tools,
  finishReason,
}: {
  toolCall: TypedToolCall<TOOLS>;
  tools: TOOLS | undefined;
  finishReason: FinishReason;
}): TypedToolError<TOOLS> | undefined {
  const tool = getOwn(tools, toolCall.toolName);

  if (!isExecutableTool(tool) || toolCall.providerExecuted === true) {
    return undefined;
  }

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
    dynamic: tool.type === 'dynamic',
    ...(toolCall.providerMetadata != null
      ? { providerMetadata: toolCall.providerMetadata }
      : {}),
    ...(toolCall.toolMetadata != null
      ? { toolMetadata: toolCall.toolMetadata }
      : {}),
    ...(toolCall.title != null ? { title: toolCall.title } : {}),
  } as TypedToolError<TOOLS>;
}
