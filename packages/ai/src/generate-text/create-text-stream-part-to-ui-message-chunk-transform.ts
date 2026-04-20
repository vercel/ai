import { getErrorMessage } from '@ai-sdk/provider-utils';
import type { ToolSet } from '@ai-sdk/provider-utils';
import {
  InferUIMessageChunk,
  UIMessageChunk,
} from '../ui-message-stream/ui-message-chunks';
import {
  InferUIMessageData,
  InferUIMessageMetadata,
  UIMessage,
} from '../ui/ui-messages';
import { TextStreamPart, UIMessageStreamOptions } from './stream-text-result';

/**
 * Creates a `TransformStream` that converts `TextStreamPart<TOOLS>` chunks
 * (as emitted by `streamText`'s `fullStream`) into `UIMessageChunk`s suitable
 * for UI message streaming.
 *
 * Compose with `handleUIMessageStreamFinish` to get the same behavior as the
 * (deprecated) `StreamTextResult.toUIMessageStream()` method.
 */
export function createTextStreamPartToUIMessageChunkTransform<
  TOOLS extends ToolSet,
  UI_MESSAGE extends UIMessage,
>({
  tools,
  sendReasoning = true,
  sendSources = false,
  sendStart = true,
  sendFinish = true,
  onError = getErrorMessage,
  messageMetadata,
  responseMessageId,
}: {
  tools: TOOLS | undefined;
  sendReasoning?: boolean;
  sendSources?: boolean;
  sendStart?: boolean;
  sendFinish?: boolean;
  onError?: (error: unknown) => string;
  messageMetadata?: UIMessageStreamOptions<UI_MESSAGE>['messageMetadata'];
  responseMessageId?: string;
}): TransformStream<TextStreamPart<TOOLS>, InferUIMessageChunk<UI_MESSAGE>> {
  // TODO simplify once dynamic is no longer needed for invalid tool inputs
  const isDynamic = (part: { toolName: string; dynamic?: boolean }) => {
    const tool = tools?.[part.toolName];

    // provider-executed, dynamic tools are not listed in the tools object
    if (tool == null) {
      return part.dynamic;
    }

    return tool?.type === 'dynamic' ? true : undefined;
  };

  return new TransformStream<
    TextStreamPart<TOOLS>,
    UIMessageChunk<
      InferUIMessageMetadata<UI_MESSAGE>,
      InferUIMessageData<UI_MESSAGE>
    >
  >({
    transform: async (part, controller) => {
      const messageMetadataValue = messageMetadata?.({ part });

      const partType = part.type;
      switch (partType) {
        case 'text-start': {
          controller.enqueue({
            type: 'text-start',
            id: part.id,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
          break;
        }

        case 'text-delta': {
          controller.enqueue({
            type: 'text-delta',
            id: part.id,
            delta: part.text,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
          break;
        }

        case 'text-end': {
          controller.enqueue({
            type: 'text-end',
            id: part.id,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
          break;
        }

        case 'reasoning-start':
        case 'reasoning-end': {
          if (sendReasoning) {
            controller.enqueue({
              type: partType,
              id: part.id,
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
            });
          }
          break;
        }

        case 'reasoning-delta': {
          if (sendReasoning) {
            controller.enqueue({
              type: 'reasoning-delta',
              id: part.id,
              delta: part.text,
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
            });
          }
          break;
        }

        case 'file':
        case 'reasoning-file': {
          if (partType !== 'reasoning-file' || sendReasoning) {
            controller.enqueue({
              type: part.type,
              mediaType: part.file.mediaType,
              url: `data:${part.file.mediaType};base64,${part.file.base64}`,
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
            });
          }
          break;
        }

        case 'source': {
          if (sendSources && part.sourceType === 'url') {
            controller.enqueue({
              type: 'source-url',
              sourceId: part.id,
              url: part.url,
              title: part.title,
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
            });
          }

          if (sendSources && part.sourceType === 'document') {
            controller.enqueue({
              type: 'source-document',
              sourceId: part.id,
              mediaType: part.mediaType,
              title: part.title,
              filename: part.filename,
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
            });
          }
          break;
        }

        case 'custom': {
          controller.enqueue({
            type: 'custom',
            kind: part.kind,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
          break;
        }

        case 'tool-input-start': {
          const dynamic = isDynamic(part);

          controller.enqueue({
            type: 'tool-input-start',
            toolCallId: part.id,
            toolName: part.toolName,
            ...(part.providerExecuted != null
              ? { providerExecuted: part.providerExecuted }
              : {}),
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
            ...(dynamic != null ? { dynamic } : {}),
            ...(part.title != null ? { title: part.title } : {}),
          });
          break;
        }

        case 'tool-input-delta': {
          controller.enqueue({
            type: 'tool-input-delta',
            toolCallId: part.id,
            inputTextDelta: part.delta,
          });
          break;
        }

        case 'tool-call': {
          const dynamic = isDynamic(part);

          if (part.invalid) {
            controller.enqueue({
              type: 'tool-input-error',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              ...(part.providerExecuted != null
                ? { providerExecuted: part.providerExecuted }
                : {}),
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
              ...(dynamic != null ? { dynamic } : {}),
              errorText: onError(part.error),
              ...(part.title != null ? { title: part.title } : {}),
            });
          } else {
            controller.enqueue({
              type: 'tool-input-available',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              ...(part.providerExecuted != null
                ? { providerExecuted: part.providerExecuted }
                : {}),
              ...(part.providerMetadata != null
                ? { providerMetadata: part.providerMetadata }
                : {}),
              ...(dynamic != null ? { dynamic } : {}),
              ...(part.title != null ? { title: part.title } : {}),
            });
          }

          break;
        }

        case 'tool-approval-request': {
          controller.enqueue({
            type: 'tool-approval-request',
            approvalId: part.approvalId,
            toolCallId: part.toolCall.toolCallId,
          });
          break;
        }

        case 'tool-result': {
          const dynamic = isDynamic(part);

          controller.enqueue({
            type: 'tool-output-available',
            toolCallId: part.toolCallId,
            output: part.output,
            ...(part.providerExecuted != null
              ? { providerExecuted: part.providerExecuted }
              : {}),
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
            ...(part.preliminary != null
              ? { preliminary: part.preliminary }
              : {}),
            ...(dynamic != null ? { dynamic } : {}),
          });
          break;
        }

        case 'tool-error': {
          const dynamic = isDynamic(part);

          controller.enqueue({
            type: 'tool-output-error',
            toolCallId: part.toolCallId,
            errorText: part.providerExecuted
              ? typeof part.error === 'string'
                ? part.error
                : JSON.stringify(part.error)
              : onError(part.error),
            ...(part.providerExecuted != null
              ? { providerExecuted: part.providerExecuted }
              : {}),
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
            ...(dynamic != null ? { dynamic } : {}),
          });
          break;
        }

        case 'tool-output-denied': {
          controller.enqueue({
            type: 'tool-output-denied',
            toolCallId: part.toolCallId,
          });
          break;
        }

        case 'error': {
          controller.enqueue({
            type: 'error',
            errorText: onError(part.error),
          });
          break;
        }

        case 'start-step': {
          controller.enqueue({ type: 'start-step' });
          break;
        }

        case 'finish-step': {
          controller.enqueue({ type: 'finish-step' });
          break;
        }

        case 'start': {
          if (sendStart) {
            controller.enqueue({
              type: 'start',
              ...(messageMetadataValue != null
                ? { messageMetadata: messageMetadataValue }
                : {}),
              ...(responseMessageId != null
                ? { messageId: responseMessageId }
                : {}),
            });
          }
          break;
        }

        case 'finish': {
          if (sendFinish) {
            controller.enqueue({
              type: 'finish',
              finishReason: part.finishReason,
              ...(messageMetadataValue != null
                ? { messageMetadata: messageMetadataValue }
                : {}),
            });
          }
          break;
        }

        case 'abort': {
          controller.enqueue(part);
          break;
        }

        case 'tool-input-end': {
          break;
        }

        case 'raw': {
          // Raw chunks are not included in UI message streams
          // as they contain provider-specific data for developer use
          break;
        }

        default: {
          const exhaustiveCheck: never = partType;
          throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
        }
      }

      // start and finish events already have metadata
      // so we only need to send metadata for other parts
      if (
        messageMetadataValue != null &&
        partType !== 'start' &&
        partType !== 'finish'
      ) {
        controller.enqueue({
          type: 'message-metadata',
          messageMetadata: messageMetadataValue,
        });
      }
    },
  }) as TransformStream<TextStreamPart<TOOLS>, InferUIMessageChunk<UI_MESSAGE>>;
}
