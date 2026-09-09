import type { LanguageModelV4Content } from '@ai-sdk/provider';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { ToolCallNotFoundForApprovalError } from '../error/tool-call-not-found-for-approval-error';
import { getOwn } from '../util/get-own';
import type { ContentPart } from './content-part';
import { DefaultGeneratedFile } from './generated-file';
import type { ToolApprovalRequestOutput } from './tool-approval-request-output';
import type { ToolApprovalResponseOutput } from './tool-approval-response-output';
import type { TypedToolCall } from './tool-call';
import type { TypedToolError } from './tool-error';
import type { ToolOutput } from './tool-output';
import type { TypedToolResult } from './tool-result';

export function convertLanguageModelContent<TOOLS extends ToolSet>({
  content,
  toolCalls,
  toolOutputs,
  toolApprovalRequests,
  toolApprovalResponses,
  tools,
}: {
  content: Array<LanguageModelV4Content>;
  toolCalls: Array<TypedToolCall<TOOLS>>;
  toolOutputs: Array<ToolOutput<TOOLS>>;
  toolApprovalRequests: Array<ToolApprovalRequestOutput<TOOLS>>;
  toolApprovalResponses: Array<ToolApprovalResponseOutput<TOOLS>>;
  tools: TOOLS | undefined;
}): Array<ContentPart<TOOLS>> {
  const contentParts: Array<ContentPart<TOOLS>> = [];
  const toolOutputsWithApprovalResponses: Array<ToolOutput<TOOLS>> = [];
  const toolOutputsWithoutApprovalResponses: Array<ToolOutput<TOOLS>> = [];
  const toolCallIdsWithApprovalResponses = new Set(
    toolApprovalResponses.map(
      toolApprovalResponse => toolApprovalResponse.toolCall.toolCallId,
    ),
  );

  for (const part of content) {
    switch (part.type) {
      case 'text':
      case 'reasoning':
      case 'custom':
      case 'source':
        contentParts.push(part);
        break;

      case 'file':
      case 'reasoning-file': {
        contentParts.push({
          type: part.type as 'file' | 'reasoning-file',
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
        });
        break;
      }

      case 'tool-call': {
        const toolCall = toolCalls.find(
          toolCall => toolCall.toolCallId === part.toolCallId,
        );

        if (toolCall == null) {
          throw new Error(`Tool call ${part.toolCallId} not found.`);
        }

        contentParts.push(toolCall);
        break;
      }

      case 'tool-result': {
        const toolCall = toolCalls.find(
          toolCall => toolCall.toolCallId === part.toolCallId,
        );

        // Handle deferred results for provider-executed tools (e.g., programmatic tool calling).
        // When a server tool (like code_execution) triggers a client tool, the server tool's
        // result may be deferred to a later turn. In this case, there's no matching tool-call
        // in the current response.
        if (toolCall == null) {
          const tool = getOwn(tools, part.toolName);
          const supportsDeferredResults =
            tool?.type === 'provider' && tool.supportsDeferredResults;

          if (!supportsDeferredResults) {
            throw new Error(`Tool call ${part.toolCallId} not found.`);
          }

          // Create tool result without tool call input (deferred result)
          if (part.isError) {
            contentParts.push({
              type: 'tool-error' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName as keyof TOOLS & string,
              input: undefined,
              error: part.result,
              providerExecuted: true,
              dynamic: part.dynamic,
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
              ...(tool?.metadata != null
                ? { toolMetadata: tool.metadata }
                : {}),
            } as TypedToolError<TOOLS>);
          } else {
            contentParts.push({
              type: 'tool-result' as const,
              toolCallId: part.toolCallId,
              toolName: part.toolName as keyof TOOLS & string,
              input: undefined,
              output: part.result,
              providerExecuted: true,
              dynamic: part.dynamic,
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
              ...(tool?.metadata != null
                ? { toolMetadata: tool.metadata }
                : {}),
            } as TypedToolResult<TOOLS>);
          }
          break;
        }

        if (part.isError) {
          contentParts.push({
            type: 'tool-error' as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName as keyof TOOLS & string,
            input: toolCall.input,
            error: part.result,
            providerExecuted: true,
            dynamic: toolCall.dynamic,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
            ...(toolCall.toolMetadata != null
              ? { toolMetadata: toolCall.toolMetadata }
              : {}),
          } as TypedToolError<TOOLS>);
        } else {
          contentParts.push({
            type: 'tool-result' as const,
            toolCallId: part.toolCallId,
            toolName: part.toolName as keyof TOOLS & string,
            input: toolCall.input,
            output: part.result,
            providerExecuted: true,
            dynamic: toolCall.dynamic,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
            ...(toolCall.toolMetadata != null
              ? { toolMetadata: toolCall.toolMetadata }
              : {}),
          } as TypedToolResult<TOOLS>);
        }
        break;
      }

      case 'tool-approval-request': {
        const toolCall = toolCalls.find(
          toolCall => toolCall.toolCallId === part.toolCallId,
        );

        if (toolCall == null) {
          throw new ToolCallNotFoundForApprovalError({
            toolCallId: part.toolCallId,
            approvalId: part.approvalId,
          });
        }

        contentParts.push({
          type: 'tool-approval-request' as const,
          approvalId: part.approvalId,
          toolCall,
        });
        break;
      }
    }
  }

  for (const toolOutput of toolOutputs) {
    if (toolCallIdsWithApprovalResponses.has(toolOutput.toolCallId)) {
      toolOutputsWithApprovalResponses.push(toolOutput);
    } else {
      toolOutputsWithoutApprovalResponses.push(toolOutput);
    }
  }

  return [
    ...contentParts,
    ...toolOutputsWithoutApprovalResponses,
    ...toolApprovalRequests,
    ...toolApprovalResponses,
    ...toolOutputsWithApprovalResponses,
  ];
}
