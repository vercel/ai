import {
  processUIMessageStream,
  StreamingUIMessageState,
} from '../ui/process-ui-message-stream';
import { createStreamingUIMessageState } from '../ui/process-ui-message-stream';
import { UIMessage } from '../ui/ui-messages';
import { UIMessageStreamPart } from './ui-message-stream-parts';
import { UIMessageStreamWriter } from './ui-message-stream-writer';

export function createUIMessageStream({
  execute,
  onError = () => 'An error occurred.', // mask error messages for safety by default
  originalMessages = [],
  onFinish,
}: {
  execute: (options: { writer: UIMessageStreamWriter }) => Promise<void> | void;
  onError?: (error: unknown) => string;

  /**
   * The original messages.
   */
  originalMessages?: UIMessage[];

  onFinish?: (options: {
    /**
     * The updates list of UI messages.
     */
    messages: UIMessage[];

    /**
     * Indicates whether the response message is a continuation of the last original message,
     * or if a new message was created.
     */
    isContinuation: boolean;

    /**
     * The message that was sent to the client as a response
     * (including the original message if it was extended).
     */
    responseMessage: UIMessage;
  }) => void;
}): ReadableStream<UIMessageStreamPart> {
  let controller!: ReadableStreamDefaultController<UIMessageStreamPart>;

  const ongoingStreamPromises: Promise<void>[] = [];

  const stream = new ReadableStream({
    start(controllerArg) {
      controller = controllerArg;
    },
  });

  function safeEnqueue(data: UIMessageStreamPart) {
    try {
      controller.enqueue(data);
    } catch (error) {
      // suppress errors when the stream has been closed
    }
  }

  try {
    const result = execute({
      writer: {
        write(part: UIMessageStreamPart) {
          safeEnqueue(part);
        },
        merge(streamArg) {
          ongoingStreamPromises.push(
            (async () => {
              const reader = streamArg.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                safeEnqueue(value);
              }
            })().catch(error => {
              safeEnqueue({ type: 'error', errorText: onError(error) });
            }),
          );
        },
        onError,
      },
    });

    if (result) {
      ongoingStreamPromises.push(
        result.catch(error => {
          safeEnqueue({ type: 'error', errorText: onError(error) });
        }),
      );
    }
  } catch (error) {
    safeEnqueue({ type: 'error', errorText: onError(error) });
  }

  // Wait until all ongoing streams are done. This approach enables merging
  // streams even after execute has returned, as long as there is still an
  // open merged stream. This is important to e.g. forward new streams and
  // from callbacks.
  const waitForStreams: Promise<void> = new Promise(async resolve => {
    while (ongoingStreamPromises.length > 0) {
      await ongoingStreamPromises.shift();
    }
    resolve();
  });

  waitForStreams.finally(() => {
    try {
      controller.close();
    } catch (error) {
      // suppress errors when the stream has been closed
    }
  });

  if (onFinish == null) {
    return stream;
  }

  const lastMessage = originalMessages[originalMessages.length - 1];
  const isContinuation = lastMessage?.role === 'assistant';
  const messageId = isContinuation ? lastMessage.id : undefined;

  const state = createStreamingUIMessageState({
    lastMessage: structuredClone(lastMessage),
    newMessageId: messageId,
  });

  const runUpdateMessageJob = async (
    job: (options: {
      state: StreamingUIMessageState;
      write: () => void;
    }) => Promise<void>,
  ) => {
    await job({ state, write: () => {} });
  };

  return processUIMessageStream({
    stream,
    runUpdateMessageJob,
  }).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },

      flush() {
        const isContinuation = state.message.id === lastMessage?.id;
        onFinish({
          isContinuation,
          responseMessage: state.message,
          messages: [
            ...(isContinuation
              ? originalMessages.slice(0, -1)
              : originalMessages),
            state.message,
          ],
        });
      },
    }),
  );
}
