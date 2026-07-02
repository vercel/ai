import type {
  AssistantContent,
  AssistantModelMessage,
  ToolContent,
  ToolModelMessage,
} from '../prompt';
import { createToolModelOutput } from '../prompt/create-tool-model-output';
import type { ContentPart } from './content-part';
import type { ToolSet } from '@ai-sdk/provider-utils';

/**
 * Converts the result of a `generateText` or `streamText` call to a list of response messages.
 */
export async function toResponseMessages<TOOLS extends ToolSet>({
  content: inputContent,
  tools,
}: {
  content: Array<ContentPart<TOOLS>>;
  tools: TOOLS | undefined;
}): Promise<Array<AssistantModelMessage | ToolModelMessage>> {
  const responseMessages: Array<AssistantModelMessage | ToolModelMessage> = [];

  const content: AssistantContent = [];
  for (const part of inputContent) {
    // Skip sources - they are response-only content that no provider expects back
    if (part.type === 'source') {
      continue;
    }

    // Skip non-provider-executed tool results/errors (they go in the tool message)
    if (
      (part.type === 'tool-result' || part.type === 'tool-error') &&
      !part.providerExecuted
    ) {
      continue;
    }

    // Skip empty text
    if (part.type === 'text' && part.text.length === 0) {
      continue;
    }

    switch (part.type) {
      case 'text':
        content.push({
          type: 'text',
          text: part.text,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'custom':
        content.push({
          type: 'custom',
          kind: part.kind,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'reasoning':
        content.push({
          type: 'reasoning',
          text: part.text,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'file':
        content.push({
          type: 'file',
          data: part.file.base64,
          mediaType: part.file.mediaType,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'reasoning-file':
        content.push({
          type: 'reasoning-file',
          data: part.file.base64,
          mediaType: part.file.mediaType,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'tool-call':
        content.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input:
            part.invalid && typeof part.input !== 'object' ? {} : part.input,
          providerExecuted: part.providerExecuted,
          providerOptions: part.providerMetadata,
        });
        break;
      case 'tool-result': {
        const output = await createToolModelOutput({
          toolCallId: part.toolCallId,
          input: part.input,
          tool: tools?.[part.toolName],
          output: part.output,
          errorMode: 'none',
        });
        content.push({
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output,
          providerOptions: part.providerMetadata,
        });
        break;
      }
      case 'tool-error': {
        const output = await createToolModelOutput({
          toolCallId: part.toolCallId,
          input: part.input,
          tool: tools?.[part.toolName],
          output: part.error,
          errorMode: 'json',
        });
        content.push({
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output,
          providerOptions: part.providerMetadata,
        });
        break;
      }
      case 'tool-approval-request':
        content.push({
          type: 'tool-approval-request',
          approvalId: part.approvalId,
          toolCallId: part.toolCall.toolCallId,
          isAutomatic: part.isAutomatic,
          ...(part.signature != null ? { signature: part.signature } : {}),
        });
        break;
    }
  }

  if (content.length > 0) {
    responseMessages.push({
      role: 'assistant',
      content,
    });
  }

  const toolCallOrder = new Map<string, number>();
  for (const part of inputContent) {
    if (part.type === 'tool-call' && !toolCallOrder.has(part.toolCallId)) {
      toolCallOrder.set(part.toolCallId, toolCallOrder.size);
    }

    if (
      part.type === 'tool-approval-request' &&
      !toolCallOrder.has(part.toolCall.toolCallId)
    ) {
      toolCallOrder.set(part.toolCall.toolCallId, toolCallOrder.size);
    }
  }

  const toolResultContent: Array<{
    part: ToolContent[number];
    toolCallId: string | undefined;
    index: number;
  }> = [];
  for (const part of inputContent) {
    if (
      part.type !== 'tool-approval-response' &&
      part.type !== 'tool-result' &&
      part.type !== 'tool-error'
    ) {
      continue;
    }

    if (part.type === 'tool-approval-response') {
      toolResultContent.push({
        part: {
          type: 'tool-approval-response',
          approvalId: part.approvalId,
          approved: part.approved,
          reason: part.reason,
          providerExecuted: part.providerExecuted,
        },
        toolCallId: part.toolCall.toolCallId,
        index: toolResultContent.length,
      });

      // when the tool approval is denied,
      // we need to add an execution-denied tool result
      // since there is no corresponding tool result for the tool call
      if (part.approved === false) {
        toolResultContent.push({
          part: {
            type: 'tool-result',
            toolCallId: part.toolCall.toolCallId,
            toolName: part.toolCall.toolName,
            output: {
              type: 'execution-denied' as const,
              reason: part.reason,
            },
          },
          toolCallId: part.toolCall.toolCallId,
          index: toolResultContent.length,
        });
      }
      continue;
    }

    if (part.providerExecuted) {
      continue;
    }

    const output = await createToolModelOutput({
      toolCallId: part.toolCallId,
      input: part.input,
      tool: tools?.[part.toolName],
      output: part.type === 'tool-result' ? part.output : part.error,
      errorMode: part.type === 'tool-error' ? 'text' : 'none',
    });

    toolResultContent.push({
      part: {
        type: 'tool-result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output,
        ...(part.providerMetadata != null
          ? { providerOptions: part.providerMetadata }
          : {}),
      },
      toolCallId: part.toolCallId,
      index: toolResultContent.length,
    });
  }

  if (toolResultContent.length > 0) {
    responseMessages.push({
      role: 'tool',
      content: [...toolResultContent]
        .sort((a, b) => {
          const orderA = getToolCallOrder(toolCallOrder, a.toolCallId);
          const orderB = getToolCallOrder(toolCallOrder, b.toolCallId);

          return orderA === orderB ? a.index - b.index : orderA - orderB;
        })
        .map(({ part }) => part),
    });
  }

  return responseMessages;
}

function getToolCallOrder(
  toolCallOrder: Map<string, number>,
  toolCallId: string | undefined,
) {
  return toolCallId == null
    ? Number.MAX_SAFE_INTEGER
    : (toolCallOrder.get(toolCallId) ?? Number.MAX_SAFE_INTEGER);
}
