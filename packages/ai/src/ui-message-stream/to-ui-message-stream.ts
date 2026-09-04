import type { ToolSet } from '@ai-sdk/provider-utils';
import type {
  TextStreamPart,
  UIMessageStreamOptions,
} from '../generate-text/stream-text-result';
import type { UIMessage } from '../ui/ui-messages';
import { getResponseUIMessageId } from './get-response-ui-message-id';
import { handleUIMessageStreamFinish } from './handle-ui-message-stream-finish';
import type { InferUIMessageChunk } from './ui-message-chunks';
import type { UIMessageStreamOutcome } from './ui-message-stream-outcome';
import { toUIMessageChunk } from './to-ui-message-chunk';

/**
 * Converts a stream of `TextStreamPart<TOOLS>` chunks (as emitted by
 * `streamText`'s `stream`) into a stream of `UIMessageChunk`s suitable for
 * UI message streaming, including response message ID injection and
 * `onEnd` handling.
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
  onError = () => 'An error occurred.', // prevent leaking server error details to the client by default
  messageMetadata,
  originalMessages,
  generateMessageId,
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

  const responseMessageId =
    generateMessageId != null
      ? getResponseUIMessageId({
          originalMessages,
          responseMessageId: generateMessageId,
        })
      : undefined;

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
    new TransformStream({
      transform: async (part, controller) => {
        try {
          const messageMetadataValue = messageMetadata?.({ part });

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

          if (uiMessageChunk != null) {
            controller.enqueue(uiMessageChunk);
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
    }),
  );

  return handleUIMessageStreamFinish({
    stream: uiMessageChunkStream,
    messageId: responseMessageId ?? generateMessageId?.(),
    originalMessages,
    onEnd: onEnd ?? onFinish,
    onError,
    getOutcome: () => outcome,
  });
}
