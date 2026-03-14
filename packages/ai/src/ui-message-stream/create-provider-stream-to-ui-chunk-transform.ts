import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import type { UIMessageChunk } from './ui-message-chunks';

/**
 * Options for creating the provider stream to UI chunk transform.
 */
export interface ProviderStreamToUIChunkTransformOptions {
  /**
   * Whether to emit a 'start' chunk at the beginning of the stream.
   */
  sendStart?: boolean;

  /**
   * The message ID to include in the start chunk.
   */
  messageId?: string;

  /**
   * Whether to include raw chunks in the output.
   * @default false
   */
  includeRawChunks?: boolean;
}

/**
 * Convert a Uint8Array to a base64 string safely.
 * Uses a loop instead of spread operator to avoid stack overflow on large arrays.
 */
function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Creates a TransformStream that converts LanguageModelV4StreamPart chunks
 * to UIMessageChunk chunks. This is used by DurableAgent's doStreamStep
 * to convert provider-level stream parts to UI-compatible chunks.
 *
 * This is a lower-level utility compared to `toUIMessageStream()` on StreamTextResult,
 * which operates on the enriched `TextStreamPart<TOOLS>` type. This function operates
 * directly on provider-level `LanguageModelV4StreamPart` chunks, making it suitable
 * for use cases that bypass the full `streamText` pipeline (e.g., DurableAgent).
 */
export function createProviderStreamToUIChunkTransform(
  options?: ProviderStreamToUIChunkTransformOptions,
): TransformStream<LanguageModelV4StreamPart, UIMessageChunk> {
  const sendStart = options?.sendStart ?? false;
  const includeRawChunks = options?.includeRawChunks ?? false;

  return new TransformStream<LanguageModelV4StreamPart, UIMessageChunk>({
    start(controller) {
      if (sendStart) {
        controller.enqueue({
          type: 'start',
          ...(options?.messageId != null
            ? { messageId: options.messageId }
            : {}),
        });
      }
      controller.enqueue({
        type: 'start-step',
      });
    },

    flush(controller) {
      controller.enqueue({
        type: 'finish-step',
      });
    },

    transform(part, controller) {
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
            delta: part.delta,
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

        case 'reasoning-start': {
          controller.enqueue({
            type: 'reasoning-start',
            id: part.id,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
          break;
        }

        case 'reasoning-delta': {
          controller.enqueue({
            type: 'reasoning-delta',
            id: part.id,
            delta: part.delta,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
          break;
        }

        case 'reasoning-end': {
          controller.enqueue({
            type: 'reasoning-end',
            id: part.id,
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
          break;
        }

        case 'file': {
          // Convert data to a data URL, handling Uint8Array and string cases
          let url: string;
          const fileData = part.data;
          if (fileData instanceof Uint8Array) {
            const base64 = uint8ArrayToBase64(fileData);
            url = `data:${part.mediaType};base64,${base64}`;
          } else if (
            fileData.startsWith('data:') ||
            fileData.startsWith('http:') ||
            fileData.startsWith('https:')
          ) {
            url = fileData;
          } else {
            url = `data:${part.mediaType};base64,${fileData}`;
          }
          controller.enqueue({
            type: 'file',
            mediaType: part.mediaType,
            url,
          });
          break;
        }

        case 'source': {
          if (part.sourceType === 'url') {
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

          if (part.sourceType === 'document') {
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

        case 'tool-input-start': {
          controller.enqueue({
            type: 'tool-input-start',
            toolCallId: part.id,
            toolName: part.toolName,
            ...(part.providerExecuted != null
              ? { providerExecuted: part.providerExecuted }
              : {}),
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

        case 'tool-input-end': {
          // End of tool input streaming - no UI chunk needed
          break;
        }

        case 'tool-call': {
          // TODO: replace JSON.parse with parseJSON from @ai-sdk/provider-utils
          controller.enqueue({
            type: 'tool-input-available',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: JSON.parse(part.input || '{}'),
            ...(part.providerExecuted != null
              ? { providerExecuted: part.providerExecuted }
              : {}),
            ...(part.providerMetadata != null
              ? { providerMetadata: part.providerMetadata }
              : {}),
          });
          break;
        }

        case 'tool-result': {
          controller.enqueue({
            type: 'tool-output-available',
            toolCallId: part.toolCallId,
            output: part.result,
          });
          break;
        }

        case 'tool-approval-request': {
          controller.enqueue({
            type: 'tool-approval-request',
            approvalId: part.approvalId,
            toolCallId: part.toolCallId,
          });
          break;
        }

        case 'error': {
          const error = part.error;
          controller.enqueue({
            type: 'error',
            errorText: error instanceof Error ? error.message : String(error),
          });
          break;
        }

        case 'stream-start':
        case 'response-metadata':
        case 'finish': {
          // Internal events - handled separately
          break;
        }

        case 'raw': {
          if (includeRawChunks) {
            // Raw chunks are provider-specific - no standard UI mapping
          }
          break;
        }

        default: {
          // Handle any other chunk types gracefully
        }
      }
    },
  });
}
