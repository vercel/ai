import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { generateId, type UIMessageChunk } from 'ai';

/**
 * Convert a Uint8Array to a base64 string safely.
 * Uses a loop instead of spread operator to avoid stack overflow on large arrays.
 */
export function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Convert a single LanguageModelV4StreamPart to a UIMessageChunk.
 * Returns undefined for parts that don't map to UI chunks (e.g., stream-start, response-metadata, finish).
 */
export function toUIMessageChunk(
  part: LanguageModelV4StreamPart,
): UIMessageChunk | undefined {
  switch (part.type) {
    case 'text-start':
      return {
        type: 'text-start',
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'text-delta':
      return {
        type: 'text-delta',
        id: part.id,
        delta: part.delta,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'text-end':
      return {
        type: 'text-end',
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'reasoning-start':
      return {
        type: 'reasoning-start',
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'reasoning-delta':
      return {
        type: 'reasoning-delta',
        id: part.id,
        delta: part.delta,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'reasoning-end':
      return {
        type: 'reasoning-end',
        id: part.id,
        ...(part.providerMetadata != null
          ? { providerMetadata: part.providerMetadata }
          : {}),
      };

    case 'file': {
      let url: string;
      const fileData = part.data as Uint8Array | string | URL;
      if (fileData instanceof Uint8Array) {
        const base64 = uint8ArrayToBase64(fileData);
        url = `data:${part.mediaType};base64,${base64}`;
      } else if (fileData instanceof URL) {
        url = fileData.href;
      } else if (
        fileData.startsWith('data:') ||
        fileData.startsWith('http:') ||
        fileData.startsWith('https:')
      ) {
        url = fileData;
      } else {
        url = `data:${part.mediaType};base64,${fileData}`;
      }
      return {
        type: 'file',
        mediaType: part.mediaType,
        url,
      };
    }

    case 'source': {
      if (part.sourceType === 'url') {
        return {
          type: 'source-url',
          sourceId: part.id,
          url: part.url,
          title: part.title,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        };
      }
      if (part.sourceType === 'document') {
        return {
          type: 'source-document',
          sourceId: part.id,
          mediaType: part.mediaType,
          title: part.title,
          filename: part.filename,
          ...(part.providerMetadata != null
            ? { providerMetadata: part.providerMetadata }
            : {}),
        };
      }
      return undefined;
    }

    case 'tool-input-start':
      return {
        type: 'tool-input-start',
        toolCallId: part.id,
        toolName: part.toolName,
        ...(part.providerExecuted != null
          ? { providerExecuted: part.providerExecuted }
          : {}),
      };

    case 'tool-input-delta':
      return {
        type: 'tool-input-delta',
        toolCallId: part.id,
        inputTextDelta: part.delta,
      };

    case 'tool-call':
      return {
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
      };

    case 'tool-result':
      return {
        type: 'tool-output-available',
        toolCallId: part.toolCallId,
        output: part.result,
      };

    case 'error': {
      const error = part.error;
      return {
        type: 'error',
        errorText: error instanceof Error ? error.message : String(error),
      };
    }

    // These don't produce UI chunks
    case 'tool-input-end':
    case 'stream-start':
    case 'response-metadata':
    case 'finish':
    case 'raw':
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Create a TransformStream that converts LanguageModelV4StreamPart to UIMessageChunk.
 * Wraps toUIMessageChunk with start/start-step/finish-step lifecycle chunks.
 */
export function createUIMessageChunkTransform(options?: {
  sendStart?: boolean;
}): TransformStream<LanguageModelV4StreamPart, UIMessageChunk> {
  return new TransformStream<LanguageModelV4StreamPart, UIMessageChunk>({
    start: controller => {
      if (options?.sendStart) {
        controller.enqueue({
          type: 'start',
          messageId: generateId(),
        });
      }
      controller.enqueue({
        type: 'start-step',
      });
    },
    flush: controller => {
      controller.enqueue({
        type: 'finish-step',
      });
    },
    transform: (part, controller) => {
      const uiChunk = toUIMessageChunk(part);
      if (uiChunk) {
        controller.enqueue(uiChunk);
      }
    },
  });
}
