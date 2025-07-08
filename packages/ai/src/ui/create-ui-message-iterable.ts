import { UIMessage } from './ui-messages';
import { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  StreamingUIMessageState,
} from './process-ui-message-stream';
import { createAsyncIterableStream } from '../util/async-iterable-stream';
import { consumeStream } from '../util/consume-stream';

export function createUiMessageIterable<UI_MESSAGE extends UIMessage>({
  message,
  stream,
}: {
  message?: UI_MESSAGE;
  stream: ReadableStream<UIMessageChunk>;
}): AsyncIterable<UI_MESSAGE> {
  let controller: ReadableStreamDefaultController<UI_MESSAGE> | undefined;

  const outputStream = new ReadableStream<UI_MESSAGE>({
    start(controllerParam) {
      controller = controllerParam;
    },
  });

  const state = createStreamingUIMessageState<UI_MESSAGE>({
    messageId: message?.id ?? '',
    lastMessage: message,
  });

  const runUpdateMessageJob = (
    job: (options: {
      state: StreamingUIMessageState<UI_MESSAGE>;
      write: () => void;
    }) => Promise<void>,
  ) => {
    return job({
      state,
      write: () => {
        controller?.enqueue(structuredClone(state.message));
      },
    });
  };

  consumeStream({
    stream: processUIMessageStream({
      stream,
      runUpdateMessageJob,
      onError: error => {
        throw error;
      },
    }),
  }).finally(() => {
    controller?.close();
  });

  return createAsyncIterableStream(outputStream);
}
