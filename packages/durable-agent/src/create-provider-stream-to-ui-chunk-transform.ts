import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import type { UIMessageChunk } from 'ai';
import { mapStreamPartToUIChunks, type MappableStreamPart } from 'ai/internal';

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
   * Whether to include raw chunks. @default false
   */
  includeRawChunks?: boolean;
}

/**
 * Normalize a LanguageModelV4StreamPart to the MappableStreamPart interface
 * so it can be processed by the shared mapStreamPartToUIChunks function.

 *
 * This bridges the field-name differences between V4 stream parts and
 * the normalized interface (e.g., file.data → file.url, tool-result.result → .output,
 * tool-call.input string → parsed object).

 */
function normalizeV4Part(
  part: LanguageModelV4StreamPart,
): MappableStreamPart | null {
  switch (part.type) {
    case 'file': {
      let url: string;
      const fileData = part.data;
      if (fileData instanceof Uint8Array) {
        const base64 = convertUint8ArrayToBase64(fileData);
        url = `data:${part.mediaType};base64,${base64}`;
      } else if (
        typeof fileData === 'string' && (
          fileData.startsWith('data:') ||
          fileData.startsWith('http:') ||
          fileData.startsWith('https:')
        )
      ) {
        url = fileData;
      } else if (typeof fileData === 'string') {
        url = `data:${part.mediaType};base64,${fileData}`;
      } else {
        return null;
      }
      return { type: 'file', url, mediaType: part.mediaType };
    }

    case 'tool-call': {
      // V4 tool-call has input as JSON string; normalize to parsed object
      // TODO: replace JSON.parse with parseJSON from @ai-sdk/provider-utils
      return {
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: JSON.parse(part.input || '{}'),
        providerExecuted: part.providerExecuted,
        providerMetadata: part.providerMetadata,
        dynamic: part.dynamic,
      };
    }

    case 'tool-result': {
      // V4 uses .result; normalized uses .output
      return {
        type: 'tool-result',
        toolCallId: part.toolCallId,
        output: part.result,
      };
    }

    // Structurally compatible — pass through
    case 'text-start':
    case 'text-delta':
    case 'text-end':
    case 'reasoning-start':
    case 'reasoning-delta':
    case 'reasoning-end':
    case 'source':
    case 'tool-input-start':
    case 'tool-input-delta':
    case 'tool-input-end':
    case 'tool-approval-request':
    case 'error':
      return part as unknown as MappableStreamPart;

    // Internal V4 events — no UI representation
    case 'stream-start':
    case 'response-metadata':
    case 'finish':
    case 'raw':
      return null;

    default:
      return null;
  }
}

/**
 * Creates a TransformStream that converts LanguageModelV4StreamPart chunks
 * to UIMessageChunk chunks.
 *
 * Internally normalizes V4 stream parts and delegates to the shared
 * mapStreamPartToUIChunks function from the ai package.
 */
export function createProviderStreamToUIChunkTransform(
  options?: ProviderStreamToUIChunkTransformOptions,
): TransformStream<LanguageModelV4StreamPart, UIMessageChunk> {
  const sendStart = options?.sendStart ?? false;

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
      const normalized = normalizeV4Part(part);
      if (normalized == null) return;

      const chunks = mapStreamPartToUIChunks(normalized);
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
    },
  });
}
