import {
  getErrorMessage,
  LanguageModelV4ResponseMetadata,
  LanguageModelV4StreamPart,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { ModelMessage, SystemModelMessage } from '@ai-sdk/provider-utils';
import { ToolCallNotFoundForApprovalError } from '../error/tool-call-not-found-for-approval-error';
import { FinishReason } from '../types/language-model';
import { ProviderMetadata } from '../types/provider-metadata';
import { asLanguageModelUsage, LanguageModelUsage } from '../types/usage';
import { DefaultGeneratedFileWithType } from './generated-file';
import { parseToolCall } from './parse-tool-call';
import {
  TextStreamFilePart,
  TextStreamPart,
  TextStreamReasoningDeltaPart,
  TextStreamReasoningFilePart,
  TextStreamTextDeltaPart,
  TextStreamToolApprovalRequestPart,
  TextStreamToolCallPart,
  TextStreamToolErrorPart,
  TextStreamToolResultPart,
} from './stream-text-result';
import { TypedToolCall } from './tool-call';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { TypedToolError } from './tool-error';
import { TypedToolResult } from './tool-result';
import { ToolSet } from './tool-set';

export type UglyTransformedStreamTextPart<TOOLS extends ToolSet> =
  | Exclude<
      TextStreamPart<TOOLS>,
      {
        type:
          | 'finish'
          | 'stream-start'
          | 'tool-output-denied'
          | 'start-step'
          | 'finish-step'
          | 'start'
          | 'abort';
      }
    >
  | TextStreamTextDeltaPart
  | TextStreamReasoningDeltaPart
  | TextStreamFilePart
  | TextStreamReasoningFilePart
  | TextStreamToolApprovalRequestPart<TOOLS>
  | TextStreamToolCallPart<TOOLS>
  | TextStreamToolResultPart<TOOLS>
  | TextStreamToolErrorPart<TOOLS>
  | {
      type: 'model-call-end';
      finishReason: FinishReason;
      rawFinishReason: string | undefined;
      usage: LanguageModelUsage;
      providerMetadata?: ProviderMetadata;
    }
  | {
      type: 'model-call-start';
      warnings: Array<SharedV4Warning>;
    }
  | ({ type: 'response-metadata' } & LanguageModelV4ResponseMetadata);

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

        case 'finish': {
          controller.enqueue({
            type: 'model-call-end',
            finishReason: chunk.finishReason.unified,
            rawFinishReason: chunk.finishReason.raw,
            usage: asLanguageModelUsage(chunk.usage),
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

        case 'tool-input-start': {
          const tool = tools?.[chunk.toolName];

          controller.enqueue({
            ...chunk,
            dynamic: chunk.dynamic ?? tool?.type === 'dynamic',
            title: tool?.title,
          });
          break;
        }

        case 'stream-start': {
          controller.enqueue({
            type: 'model-call-start',
            warnings: chunk.warnings,
          });
          break;
        }

        default:
          controller.enqueue(chunk);
          break;
      }
    },
  });
}
