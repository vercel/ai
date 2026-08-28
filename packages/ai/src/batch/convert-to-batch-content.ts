import type {
  LanguageModelV4Content,
  LanguageModelV4ToolCall,
} from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { DefaultGeneratedFile } from '../generate-text/generated-file';
import type { BatchContentPart } from './batch-types';

type BatchToolCall = Extract<BatchContentPart, { type: 'tool-call' }>;

/**
 * Normalizes provider content without tool execution, repair, or remote file
 * access. Batch retrieval intentionally has no dependency on the original
 * request's tool definitions.
 */
export async function convertToBatchContent(
  content: Array<LanguageModelV4Content>,
): Promise<Array<BatchContentPart>> {
  const toolCalls = new Map<string, BatchToolCall>();

  for (const part of content) {
    if (part.type === 'tool-call') {
      toolCalls.set(part.toolCallId, await convertToolCall(part));
    }
  }

  return content.map(part => {
    switch (part.type) {
      case 'text':
      case 'reasoning':
      case 'custom':
      case 'source':
        return part;

      case 'file':
      case 'reasoning-file':
        return {
          type: part.type,
          file: new DefaultGeneratedFile({
            data:
              part.data.type === 'data'
                ? part.data.data
                : part.data.url.toString(),
            mediaType: part.mediaType,
          }),
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        };

      case 'tool-call':
        return toolCalls.get(part.toolCallId)!;

      case 'tool-result': {
        const toolCall = toolCalls.get(part.toolCallId);
        const shared = {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: toolCall?.input,
          providerExecuted: true as const,
          dynamic: part.dynamic ?? toolCall?.dynamic,
          preliminary: part.preliminary,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        };

        return part.isError
          ? {
              type: 'tool-error' as const,
              ...shared,
              error: part.result,
            }
          : {
              type: 'tool-result' as const,
              ...shared,
              output: part.result,
            };
      }

      case 'tool-approval-request': {
        const toolCall = toolCalls.get(part.toolCallId);

        if (toolCall == null) {
          throw new Error(
            `Tool call ${part.toolCallId} for approval ${part.approvalId} not found.`,
          );
        }

        return {
          type: 'tool-approval-request',
          approvalId: part.approvalId,
          toolCall,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        };
      }
    }
  });
}

async function convertToolCall(
  part: LanguageModelV4ToolCall,
): Promise<BatchToolCall> {
  const parsedInput =
    part.input.trim() === ''
      ? { success: true as const, value: {} }
      : await safeParseJSON({ text: part.input });

  return {
    type: 'tool-call',
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    input: parsedInput.success ? parsedInput.value : part.input,
    providerExecuted: part.providerExecuted,
    dynamic: part.dynamic,
    ...(part.providerMetadata != null
      ? { providerMetadata: part.providerMetadata }
      : {}),
    ...(parsedInput.success
      ? {}
      : {
          invalid: true,
          error: parsedInput.error,
        }),
  };
}
