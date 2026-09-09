import type { ToolSet, UIMessageChunk } from 'ai';
import type { ModelCallStreamPart } from './do-stream-step.js';

/**
 * Convert a single ModelCallStreamPart to a UIMessageChunk.
 * Returns undefined for parts that don't map to UI chunks.
 */
export function toUIMessageChunk(
  part: ModelCallStreamPart<ToolSet>,
): UIMessageChunk | undefined {
  switch (part.type) {
    case 'reset-step':
      return { type: 'reset-step' };

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
        toolCallId: part.id,
        inputTextDelta: part.delta,
      };

    case 'tool-call': {
      // parseToolCall adds invalid/error at runtime for failed parses
      const toolCallPart = part as typeof part & {
        invalid?: boolean;
        error?: unknown;
      };
      if (toolCallPart.invalid) {
        return {
          type: 'tool-input-error',
          toolCallId: toolCallPart.toolCallId,
          toolName: toolCallPart.toolName,
          input: toolCallPart.input,
          errorText:
            toolCallPart.error instanceof Error
              ? toolCallPart.error.message
              : String(toolCallPart.error ?? 'Invalid tool call'),
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

    case 'tool-approval-request':
      return {
        type: 'tool-approval-request',
        approvalId: part.approvalId,
        toolCallId:
          'toolCallId' in part ? part.toolCallId : part.toolCall.toolCallId,
        ...(part.signature != null ? { signature: part.signature } : {}),
      };

    default: {
      // Pass through step boundaries and other chunks as-is. Step boundaries
      // (finish-step/start-step) are not standard ModelCallStreamPart types
      // but are written by the WorkflowAgent between tool execution and the
      // next model step to ensure proper message splitting in
      // convertToModelMessages.
      const passthroughPart = part as any;
      if (
        passthroughPart.type === 'finish-step' ||
        passthroughPart.type === 'start-step' ||
        passthroughPart.type === 'tool-output-denied'
      ) {
        return passthroughPart as UIMessageChunk;
      }
      return undefined;
    }
  }
}

/**
 * Create a TransformStream that converts ModelCallStreamPart to UIMessageChunk.
 * Wraps toUIMessageChunk with start/start-step/finish-step lifecycle chunks.
 *
 * When resuming a stream, provide `uiStartIndex` and replay the source
 * ModelCallStreamPart stream from index 0. The transform will omit the UI
 * chunks that the client has already received. Raw model stream parts and UI
 * message chunks do not have a one-to-one relationship, so a UI chunk index
 * must not be used as the source stream's start index.
 */
export function createModelCallToUIChunkTransform({
  uiStartIndex = 0,
}: {
  /**
   * Number of transformed UIMessageChunks to omit from the output.
   * Must be a non-negative safe integer.
   */
  uiStartIndex?: number;
} = {}): TransformStream<ModelCallStreamPart<ToolSet>, UIMessageChunk> {
  if (!Number.isSafeInteger(uiStartIndex) || uiStartIndex < 0) {
    throw new RangeError('uiStartIndex must be a non-negative safe integer');
  }

  let uiChunkIndex = 0;

  const enqueue = (
    controller: TransformStreamDefaultController<UIMessageChunk>,
    chunk: UIMessageChunk,
  ) => {
    if (uiChunkIndex++ >= uiStartIndex) {
      controller.enqueue(chunk);
    }
  };

  return new TransformStream<ModelCallStreamPart<ToolSet>, UIMessageChunk>({
    start: controller => {
      enqueue(controller, { type: 'start' });
      enqueue(controller, { type: 'start-step' });
    },
    flush: controller => {
      enqueue(controller, { type: 'finish-step' });
      enqueue(controller, { type: 'finish' });
    },
    transform: (part, controller) => {
      const uiChunk = toUIMessageChunk(part);
      if (uiChunk) {
        enqueue(controller, uiChunk);
      }
    },
  });
}
