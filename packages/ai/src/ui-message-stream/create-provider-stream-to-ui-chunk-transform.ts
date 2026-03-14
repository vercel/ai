import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import type { MappableStreamPart } from './map-stream-part-to-ui-chunks';
import { mapStreamPartToUIChunks } from './map-stream-part-to-ui-chunks';
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
      // Convert raw data to a URL string
      let url: string;
      const fileData = part.data;
      if (fileData instanceof Uint8Array) {
        const base64 = uint8ArrayToBase64(fileData);
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

    // These types are structurally compatible — pass through directly
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
 * `mapStreamPartToUIChunks` function, which is also used by
 * `streamText`'s `toUIMessageStream()`.
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
