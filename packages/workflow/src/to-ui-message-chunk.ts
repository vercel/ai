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
        ...('inputSchemaInput' in part && part.inputSchemaInput !== undefined
          ? { inputSchemaInput: part.inputSchemaInput }
          : {}),
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
 *
 * A model step can run more than once, and two executions can write to the
 * stream at the same time. Each execution tags its parts with an `attemptId`
 * and announces itself with a `reset-step` part. The transform forwards the
 * parts of the latest announced execution and withholds those of the others.
 * When the workflow names another execution as the one it continued with
 * (`commitAttemptId`), the transform resets the step and forwards that
 * execution's parts instead. Parts without an `attemptId` are always
 * forwarded.
 *
 * A step that writes parts on behalf of the workflow can also run more than
 * once. Those parts carry a `writeId`, and the transform forwards each of
 * them once.
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

  const forward = (
    controller: TransformStreamDefaultController<UIMessageChunk>,
    part: ModelCallStreamPart<ToolSet>,
  ) => {
    const uiChunk = toUIMessageChunk(part);
    if (uiChunk) {
      enqueue(controller, uiChunk);
    }
  };

  // Parts of the executions of the model call in progress, by attempt id, in
  // announcement order. Kept until the workflow names the execution it
  // continued with, because that can be one that was withheld.
  const attempts = new Map<string, Array<ModelCallStreamPart<ToolSet>>>();
  // The execution whose parts are being forwarded.
  let forwardedAttemptId: string | undefined;
  // False until the stream shows where an execution starts or ends. A reader
  // that joins in the middle of an execution adopts it.
  let hasSeenAttemptBoundary = false;
  // Ids of the parts already seen that the workflow asked a step to write.
  const seenWriteIds = new Set<string>();

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
      if (part.writeId != null) {
        // A step that writes parts for the workflow can run again.
        if (seenWriteIds.has(part.writeId)) return;
        seenWriteIds.add(part.writeId);
        if (seenWriteIds.size > MAX_RETAINED_WRITE_IDS) {
          seenWriteIds.delete(seenWriteIds.values().next().value as string);
        }
      }

      if (part.commitAttemptId != null) {
        hasSeenAttemptBoundary = true;
        // A commit for an execution that is not retained was applied before,
        // or names a model call this reader did not see. A step that writes a
        // commit can run again, so a repeated commit must not end the model
        // call that is in progress by then.
        const committed = attempts.get(part.commitAttemptId);
        if (committed != null) {
          if (part.commitAttemptId !== forwardedAttemptId) {
            // The reader was shown another execution. Replace it.
            enqueue(controller, { type: 'reset-step' });
            for (const committedPart of committed) {
              forward(controller, committedPart);
            }
          }
          attempts.clear();
          forwardedAttemptId = undefined;
        }
      }

      if (part.type === 'commit-step') {
        return;
      }

      const attemptId = part.attemptId;

      if (part.type === 'reset-step') {
        hasSeenAttemptBoundary = true;
        if (attemptId == null) {
          // Written by a version that does not identify executions.
          attempts.clear();
          forwardedAttemptId = undefined;
        } else {
          attempts.set(attemptId, []);
          forwardedAttemptId = attemptId;
          // Without a commit, executions of earlier model calls stay here.
          // Keep the few that can still be named.
          while (attempts.size > MAX_RETAINED_ATTEMPTS) {
            attempts.delete(attempts.keys().next().value as string);
          }
        }
        forward(controller, part);
        return;
      }

      if (attemptId == null) {
        forward(controller, part);
        return;
      }

      if (!hasSeenAttemptBoundary) {
        hasSeenAttemptBoundary = true;
        attempts.set(attemptId, []);
        forwardedAttemptId = attemptId;
      }

      // Parts of an execution that was never announced here, or that belongs
      // to a model call the workflow has moved past, are dropped.
      attempts.get(attemptId)?.push(part);
      if (attemptId === forwardedAttemptId) {
        forward(controller, part);
      }
    },
  });
}

/**
 * How many executions of a model call the transform retains at once. More
 * than two executions of one model call are not expected.
 */
const MAX_RETAINED_ATTEMPTS = 3;

/**
 * How many ids of written parts the transform remembers. A repeated part
 * follows the original closely, since both come from executions of one step.
 */
const MAX_RETAINED_WRITE_IDS = 1024;
