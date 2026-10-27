import {
  generateId as generateIdFunc,
  type ToolSet,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { hasApplicationToolErrors } from '../compact-messages/has-application-tool-errors';
import type {
  TextStreamPart,
  UIMessageStreamOptions,
} from '../generate-text/stream-text-result';
import type { UIMessage } from '../ui/ui-messages';
import { getResponseUIMessageId } from './get-response-ui-message-id';
import {
  handleUIMessageStreamFinish,
  type UIMessageStreamInputChunk,
} from './handle-ui-message-stream-finish';
import type { InferUIMessageChunk } from './ui-message-chunks';
import type { UIMessageStreamOutcome } from './ui-message-stream-outcome';
import { toUIMessageChunk } from './to-ui-message-chunk';

/**
 * Converts a stream of `TextStreamPart<TOOLS>` chunks (as emitted by
 * `streamText`'s `stream`) into a stream of `UIMessageChunk`s suitable for
 * UI message streaming, including response message ID injection and
 * step and stream end callbacks.
 */
export function toUIMessageStream<
  TOOLS extends ToolSet = ToolSet,
  UI_MESSAGE extends UIMessage = UIMessage,
>({
  stream,
  tools,
  sendReasoning = true,
  sendSources = false,
  sendStart = true,
  sendFinish = true,
  onError = () => 'An error occurred.', // masks errors except provider-executed tool execution errors
  messageMetadata,
  originalMessages,
  compaction,
  generateMessageId,
  onStepEnd,
  onStepFinish,
  onEnd,
  onFinish,
}: {
  stream: ReadableStream<TextStreamPart<TOOLS>>;
  tools?: TOOLS;
} & UIMessageStreamOptions<UI_MESSAGE>): ReadableStream<
  InferUIMessageChunk<UI_MESSAGE>
> {
  let outcome: UIMessageStreamOutcome = { status: 'unknown' };
  let hasFatalFailure = false;
  let pendingCompaction = compaction;
  let hasMaskedToolErrors = false;

  const setSourceOutcome = (newOutcome: UIMessageStreamOutcome) => {
    if (
      !hasFatalFailure &&
      outcome.status !== 'completed' &&
      outcome.status !== 'aborted' &&
      newOutcome.status !== 'unknown' &&
      (outcome.status === 'unknown' || newOutcome.status !== 'failed')
    ) {
      outcome = newOutcome;
    }
  };

  const failOutcome = (error: unknown) => {
    hasFatalFailure = true;
    outcome = { status: 'failed', error };
  };

  const responseMessageId = getResponseUIMessageId({
    originalMessages,
    responseMessageId: generateMessageId ?? generateIdFunc,
  });

  const sourceReader = stream.getReader();
  let sourceReaderReleased = false;
  let sourceStreamCancelled = false;

  const releaseSourceReader = () => {
    if (!sourceReaderReleased) {
      sourceReader.releaseLock();
      sourceReaderReleased = true;
    }
  };

  const sourceStream = new ReadableStream<TextStreamPart<TOOLS>>({
    async pull(controller) {
      try {
        const { done, value } = await sourceReader.read();

        if (done) {
          releaseSourceReader();
          if (!sourceStreamCancelled) {
            controller.close();
          }
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        releaseSourceReader();
        if (!sourceStreamCancelled) {
          failOutcome(error);
          controller.error(error);
        }
      }
    },

    async cancel(reason) {
      sourceStreamCancelled = true;
      if (sourceReaderReleased) {
        return;
      }

      try {
        await sourceReader.cancel(reason);
      } finally {
        releaseSourceReader();
      }
    },
  });

  const uiMessageChunkStream = sourceStream.pipeThrough(
    new TransformStream<
      TextStreamPart<TOOLS>,
      UIMessageStreamInputChunk<UI_MESSAGE>
    >({
      transform: async (part, controller) => {
        try {
          if (
            (part.type === 'tool-error' && !part.providerExecuted) ||
            (part.type === 'tool-call' && part.invalid)
          ) {
            hasMaskedToolErrors = true;
          }
          const messageMetadataValue = messageMetadata?.({ part });

          if (part.type === 'compaction') {
            if (!sendReasoning) {
              throw new InvalidArgumentError({
                parameter: 'sendReasoning',
                value: sendReasoning,
                message:
                  'Automatic client-persisted compaction is incompatible with sendReasoning: false. Keep compacted model context server-side when withholding reasoning.',
              });
            }
            if (
              hasMaskedToolErrors ||
              part.hasUnredactedToolErrors ||
              hasApplicationToolErrors(part.messages)
            ) {
              throw new InvalidArgumentError({
                parameter: 'compaction',
                value: undefined,
                message:
                  'Automatic client-persisted compaction cannot include context with masked application tool errors. Keep compacted model context server-side.',
              });
            }
            if (originalMessages == null || originalMessages.length === 0) {
              throw new InvalidArgumentError({
                parameter: 'originalMessages',
                value: originalMessages,
                message:
                  'Automatic UI compaction requires the original UI messages.',
              });
            }
            if (!sendStart && originalMessages.at(-1)?.role !== 'assistant') {
              throw new InvalidArgumentError({
                parameter: 'sendStart',
                value: sendStart,
                message:
                  'Automatic UI compaction with sendStart disabled requires originalMessages to end with the current assistant message, including every previously emitted part.',
              });
            }

            controller.enqueue({
              type: 'compaction-context',
              messages: part.messages,
              checkpoint: part.checkpoint,
            });
            if (messageMetadataValue != null) {
              controller.enqueue({
                type: 'message-metadata',
                messageMetadata: messageMetadataValue,
              });
            }
            return;
          }

          const uiMessageChunk = toUIMessageChunk(part, {
            tools,
            sendReasoning,
            sendSources,
            sendStart,
            sendFinish,
            onError,
            messageMetadata: messageMetadataValue,
            responseMessageId,
          });

          // A start chunk can reset replay state, so the record must follow it.
          // Without a start chunk, emit the record before any response content.
          if (pendingCompaction != null && uiMessageChunk?.type !== 'start') {
            controller.enqueue(pendingCompaction);
            pendingCompaction = undefined;
          }

          if (uiMessageChunk != null && part.type !== 'finish-step') {
            controller.enqueue(uiMessageChunk);
          }

          if (pendingCompaction != null) {
            controller.enqueue(pendingCompaction);
            pendingCompaction = undefined;
          }

          // start and finish events already include metadata in the converted
          // chunk; for other part types emit a separate message-metadata chunk
          if (
            messageMetadataValue != null &&
            part.type !== 'start' &&
            part.type !== 'finish'
          ) {
            controller.enqueue({
              type: 'message-metadata',
              messageMetadata: messageMetadataValue,
            });
          }

          // Apply step metadata before the boundary triggers a UI snapshot.
          if (uiMessageChunk != null && part.type === 'finish-step') {
            controller.enqueue(uiMessageChunk);
          }

          if (part.type === 'finish') {
            setSourceOutcome({ status: 'completed' });
          } else if (part.type === 'abort') {
            setSourceOutcome({ status: 'aborted' });
          } else if (part.type === 'error') {
            setSourceOutcome({ status: 'failed', error: part.error });
          }
        } catch (error) {
          failOutcome(error);
          throw error;
        }
      },
      flush(controller) {
        if (pendingCompaction != null) {
          controller.enqueue(pendingCompaction);
        }
      },
    }),
  );

  return handleUIMessageStreamFinish({
    stream: uiMessageChunkStream,
    messageId: responseMessageId ?? generateMessageId?.(),
    originalMessages,
    processCompaction: originalMessages != null,
    onStepEnd: onStepEnd ?? onStepFinish,
    onEnd: onEnd ?? onFinish,
    onError,
    getOutcome: () => outcome,
  });
}
