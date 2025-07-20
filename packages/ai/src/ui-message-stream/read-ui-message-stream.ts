import { UIMessage } from '../ui/ui-messages';
import { UIMessageChunk } from './ui-message-chunks';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  StreamingUIMessageState,
} from '../ui/process-ui-message-stream';
import {
  AsyncIterableStream,
  createAsyncIterableStream,
} from '../util/async-iterable-stream';
import { consumeStream } from '../util/consume-stream';

/**
 * Transforms a stream of `UIMessageChunk`s into an `AsyncIterableStream` of `UIMessage`s.
 *
 * @param options.message - The last assistant message to use as a starting point when the conversation is resumed. Otherwise undefined.
 * @param options.stream - The stream of `UIMessageChunk`s to read.
 *
 * @returns An `AsyncIterableStream` of `UIMessage`s. Each stream part is a different state of the same message
 * as it is being completed.
 */
export function readUIMessageStream<UI_MESSAGE extends UIMessage>({
  message,
  stream,
}: {
  message?: UI_MESSAGE;
  stream: ReadableStream<UIMessageChunk>;
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
    if (!hasErrored) {
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
          write: () => void;
        }) => Promise<void>,
      ) {
        return job({
          state,
          write: () => {
            controller?.enqueue(structuredClone(state.message));
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
