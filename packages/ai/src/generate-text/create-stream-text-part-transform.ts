import { getErrorMessage, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { ProviderMetadata } from '../types/provider-metadata';
import { DefaultGeneratedFileWithType, GeneratedFile } from './generated-file';
import { TypedToolCall } from './tool-call';
import { ToolSet } from './tool-set';
import { ToolCallNotFoundForApprovalError } from '../error/tool-call-not-found-for-approval-error';
import { TypedToolError } from './tool-error';
import { TypedToolResult } from './tool-result';
import { ToolApprovalRequestOutput } from './tool-approval-request-output';
import { parseToolCall } from './parse-tool-call';
import { ModelMessage, SystemModelMessage } from '@ai-sdk/provider-utils';
import { ToolCallRepairFunction } from './tool-call-repair-function';

export type UglyTransformedStreamTextPart<TOOLS extends ToolSet> =
  | Exclude<
      LanguageModelV4StreamPart,
      | {
          type: 'text-delta';
        }
      | {
          type: 'reasoning-delta';
        }
      | {
          type: 'file';
        }
      | {
          type: 'reasoning-file';
        }
      | {
          type: 'tool-approval-request';
        }
      | {
          type: 'tool-result';
        }
      | {
          type: 'tool-call';
        }
    >
  | {
      type: 'text-delta';
      id: string;
      providerMetadata?: ProviderMetadata;
      text: string;
    }
  | {
      type: 'reasoning-delta';
      id: string;
      providerMetadata?: ProviderMetadata;
      text: string;
    }
  | {
      type: 'file';
      file: GeneratedFile;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'reasoning-file';
      file: GeneratedFile;
      providerMetadata?: ProviderMetadata;
    }
  | ToolApprovalRequestOutput<TOOLS>
  | ({ type: 'tool-call' } & TypedToolCall<TOOLS>)
  | ({ type: 'tool-result' } & TypedToolResult<TOOLS>)
  | ({ type: 'tool-error' } & TypedToolError<TOOLS>);

export function createStreamTextPartTransform<TOOLS extends ToolSet>({
  tools,
  system,
  messages,
  repairToolCall,
}: {
  tools: TOOLS | undefined;
  system: string | SystemModelMessage | Array<SystemModelMessage> | undefined;
  messages: ModelMessage[];
  repairToolCall: ToolCallRepairFunction<TOOLS> | undefined;
}) {
  // keep track of parsed tool calls so provider-emitted approval requests can reference them
  // keep track of tool inputs for provider-side tool results
  const toolCallsByToolCallId = new Map<string, TypedToolCall<TOOLS>>();

  return new TransformStream<
    LanguageModelV4StreamPart,
    UglyTransformedStreamTextPart<TOOLS>
  >({
    async transform(chunk, controller) {
      switch (chunk.type) {
        case 'text-delta':
          controller.enqueue({
            type: 'text-delta',
            id: chunk.id,
            text: chunk.delta,
            providerMetadata: chunk.providerMetadata,
          });
          break;

        case 'reasoning-delta':
          controller.enqueue({
            type: 'reasoning-delta',
            id: chunk.id,
            text: chunk.delta,
            providerMetadata: chunk.providerMetadata,
          });
          break;

        case 'file':
        case 'reasoning-file': {
          controller.enqueue({
            type: chunk.type,
            file: new DefaultGeneratedFileWithType({
              data: chunk.data,
              mediaType: chunk.mediaType,
            }),
            providerMetadata: chunk.providerMetadata,
          });
          break;
        }

        case 'tool-call': {
          try {
            const toolCall = await parseToolCall({
              toolCall: chunk,
              tools,
              repairToolCall,
              system,
              messages,
            });

            toolCallsByToolCallId.set(toolCall.toolCallId, toolCall);
            controller.enqueue(toolCall);

            if (toolCall.invalid) {
              controller.enqueue({
                type: 'tool-error',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
                error: getErrorMessage(toolCall.error!),
                dynamic: true,
                title: toolCall.title,
              });
              break;
            }
          } catch (error) {
            controller.enqueue({ type: 'error', error });
          }

          break;
        }

        case 'tool-approval-request': {
          const toolCall = toolCallsByToolCallId.get(chunk.toolCallId);

          if (toolCall == null) {
            controller.enqueue({
              type: 'error',
              error: new ToolCallNotFoundForApprovalError({
                toolCallId: chunk.toolCallId,
                approvalId: chunk.approvalId,
              }),
            });
            break;
          }

          controller.enqueue({
            type: 'tool-approval-request',
            approvalId: chunk.approvalId,
            toolCall,
          });
          break;
        }

        case 'tool-result': {
          const toolName = chunk.toolName as keyof TOOLS & string;

          controller.enqueue(
            chunk.isError
              ? ({
                  type: 'tool-error',
                  toolCallId: chunk.toolCallId,
                  toolName,
                  input: toolCallsByToolCallId.get(chunk.toolCallId)?.input,
                  providerExecuted: true,
                  error: chunk.result,
                  dynamic: chunk.dynamic,
                  ...(chunk.providerMetadata != null
                    ? { providerMetadata: chunk.providerMetadata }
                    : {}),
                } as TypedToolError<TOOLS>)
              : ({
                  type: 'tool-result',
                  toolCallId: chunk.toolCallId,
                  toolName,
                  input: toolCallsByToolCallId.get(chunk.toolCallId)?.input,
                  output: chunk.result,
                  providerExecuted: true,
                  dynamic: chunk.dynamic,
                  ...(chunk.providerMetadata != null
                    ? { providerMetadata: chunk.providerMetadata }
                    : {}),
                } as TypedToolResult<TOOLS>),
          );

          break;
        }

        default:
          controller.enqueue(chunk);
          break;
      }
    },
  });
}
