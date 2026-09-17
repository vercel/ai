import type { UIMessage } from '../ui/ui-messages';
import type { UIMessageChunk } from './ui-message-chunks';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  type StreamingUIMessageState,
  type UIMessageStreamWriteOptions,
} from '../ui/process-ui-message-stream';
import {
  createAsyncIterableStream,
  type AsyncIterableStream,
} from '../util/async-iterable-stream';
import { consumeStream } from '../util/consume-stream';

function createUIMessageSnapshot<UI_MESSAGE extends UIMessage>(
  message: UI_MESSAGE,
): UI_MESSAGE {
  const textByPartIndex = new Map<number, string>();
  const messageWithoutText = {
    ...message,
    parts: message.parts.map((part, index) => {
      if (part.type === 'text' || part.type === 'reasoning') {
        textByPartIndex.set(index, part.text);
        return { ...part, text: '' };
      }

      return part;
    }),
  };

  const snapshot = structuredClone(messageWithoutText) as UI_MESSAGE;

  for (const [index, text] of textByPartIndex) {
    const part = snapshot.parts[index];

    if (part.type === 'text' || part.type === 'reasoning') {
      part.text = text;
    }
  }

  return snapshot;
}

/**
 * Transforms a stream of `UIMessageChunk`s into an `AsyncIterableStream` of `UIMessage`s.
 *
 * @param options.message - The last assistant message to use as a starting point when the conversation is resumed. Otherwise undefined.
 * @param options.stream - The stream of `UIMessageChunk`s to read.
 * @param options.terminateOnError - Whether to terminate the stream if an error occurs.
 * @param options.onError - A function that is called when an error occurs.
 *
 * @returns An `AsyncIterableStream` of `UIMessage`s. Each stream part is a different state of the same message
 * as it is being completed.
 */
export function readUIMessageStream<UI_MESSAGE extends UIMessage>({
  message,
  stream,
  onError,
  terminateOnError = false,
}: {
  message?: UI_MESSAGE;
  stream: ReadableStream<UIMessageChunk>;
  onError?: (error: unknown) => void;
  terminateOnError?: boolean;
}): AsyncIterableStream<UI_MESSAGE> {
  let controller: ReadableStreamDefaultController<UI_MESSAGE> | undefined;
  let hasErrored = false;

  const outputStream = new ReadableStream<UI_MESSAGE>({
    start(controllerParam) {
      controller = controllerParam;
    },
  });

  const state = createStreamingUIMessageState<UI_MESSAGE>({
    messageId: message?.id ?? '',
    lastMessage: message,
  });

  const handleError = (error: unknown) => {
    onError?.(error);

    if (!hasErrored && terminateOnError) {
      hasErrored = true;
      controller?.error(error);
    }
  };

  consumeStream({
    stream: processUIMessageStream({
      stream,
      runUpdateMessageJob(
        job: (options: {
          state: StreamingUIMessageState<UI_MESSAGE>;
          write: (options?: UIMessageStreamWriteOptions) => void;
        }) => Promise<void>,
      ) {
        return job({
          state,
          write: () => {
            controller?.enqueue(createUIMessageSnapshot(state.message));
          },
        });
      },
      onError: handleError,
    }),
    onError: handleError,
  }).finally(() => {
    // Only close if no error occurred. Calling close() on an errored controller
    // throws "Invalid state: Controller is already closed" TypeError.
    if (!hasErrored) {
      controller?.close();
    }
  });

  return createAsyncIterableStream(outputStream);
}
