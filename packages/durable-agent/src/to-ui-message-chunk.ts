import { generateId, type ToolSet, type UIMessageChunk } from 'ai';
import type { Experimental_ModelCallStreamPart as ModelCallStreamPart } from 'ai';

/**
 * Convert a single ModelCallStreamPart to a UIMessageChunk.
 * Returns undefined for parts that don't map to UI chunks.
 */
export function toUIMessageChunk(
  part: ModelCallStreamPart<ToolSet>,
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
        delta: part.text,
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
        delta: part.text,
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
      const file = part.file;
      // GeneratedFile.base64 always has data (lazy-converted from Uint8Array if needed)
      return {
        type: 'file',
        mediaType: file.mediaType,
        url: `data:${file.mediaType};base64,${file.base64}`,
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
        toolCallId: (part as any).id ?? (part as any).toolCallId,
        inputTextDelta: (part as any).delta ?? (part as any).inputTextDelta,
      };

    case 'tool-call': {
      if ((part as any).invalid) {
        return {
          type: 'tool-input-error',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          errorText:
            (part as any).error instanceof Error
              ? (part as any).error.message
              : String((part as any).error ?? 'Invalid tool call'),
        };
      }
      return {
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
      };
    }

    case 'tool-result':
      return {
        type: 'tool-output-available',
        toolCallId: part.toolCallId,
        output: part.output,
      };

    case 'tool-error':
      return {
        type: 'tool-output-error',
        toolCallId: part.toolCallId,
        errorText:
          part.error instanceof Error ? part.error.message : String(part.error),
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
    case 'model-call-start':
    case 'model-call-response-metadata':
    case 'model-call-end':
    case 'raw':
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Create a TransformStream that converts ModelCallStreamPart to UIMessageChunk.
 * Wraps toUIMessageChunk with start/start-step/finish-step lifecycle chunks.
 */
export function createModelCallToUIChunkTransform(): TransformStream<
  ModelCallStreamPart<ToolSet>,
  UIMessageChunk
> {
  return new TransformStream<ModelCallStreamPart<ToolSet>, UIMessageChunk>({
    start: controller => {
      controller.enqueue({ type: 'start', messageId: generateId() });
      controller.enqueue({ type: 'start-step' });
    },
    flush: controller => {
      controller.enqueue({ type: 'finish-step' });
      controller.enqueue({ type: 'finish' });
    },
    transform: (part, controller) => {
      const uiChunk = toUIMessageChunk(part);
      if (uiChunk) {
        controller.enqueue(uiChunk);
      }
    },
  });
}

// Keep backward compat export name
export { createModelCallToUIChunkTransform as createUIMessageChunkTransform };
