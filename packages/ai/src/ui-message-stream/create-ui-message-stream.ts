import {
  generateId as generateIdFunc,
  IdGenerator,
} from '@ai-sdk/provider-utils';
import { UIMessage } from '../ui/ui-messages';
import { handleUIMessageStreamFinish } from './handle-ui-message-stream-finish';
import { InferUIMessageStreamPart } from './ui-message-stream-parts';
import { UIMessageStreamWriter } from './ui-message-stream-writer';

export function createUIMessageStream<UI_MESSAGE extends UIMessage>({
  execute,
  onError = () => 'An error occurred.', // mask error messages for safety by default
  originalMessages,
  onFinish,
  generateId = generateIdFunc,
}: {
  execute: (options: {
    writer: UIMessageStreamWriter<UI_MESSAGE>;
  }) => Promise<void> | void;
  onError?: (error: unknown) => string;

  /**
   * The original messages. If they are provided, persistence mode is assumed,
   * and a message ID is provided for the response message.
   */
  originalMessages?: UI_MESSAGE[];

  onFinish?: (options: {
    /**
     * The updates list of UI messages.
     */
    messages: UI_MESSAGE[];

    /**
     * Indicates whether the response message is a continuation of the last original message,
     * or if a new message was created.
     */
    isContinuation: boolean;

    /**
     * The message that was sent to the client as a response
     * (including the original message if it was extended).
     */
    responseMessage: UI_MESSAGE;
  }) => void;

  generateId?: IdGenerator;
}): ReadableStream<InferUIMessageStreamPart<UI_MESSAGE>> {
  let controller!: ReadableStreamDefaultController<
    InferUIMessageStreamPart<UI_MESSAGE>
  >;

  const ongoingStreamPromises: Promise<void>[] = [];

  const stream = new ReadableStream({
    start(controllerArg) {
      controller = controllerArg;
    },
  });

  function safeEnqueue(data: InferUIMessageStreamPart<UI_MESSAGE>) {
    try {
      controller.enqueue(data);
    } catch (error) {
      // suppress errors when the stream has been closed
    }
  }

  try {
    const result = execute({
      writer: {
        write(part: InferUIMessageStreamPart<UI_MESSAGE>) {
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
              safeEnqueue({
                type: 'error',
                errorText: onError(error),
              } as InferUIMessageStreamPart<UI_MESSAGE>);
            }),
          );
        },
        onError,
      },
    });

    if (result) {
      ongoingStreamPromises.push(
        result.catch(error => {
          safeEnqueue({
            type: 'error',
            errorText: onError(error),
          } as InferUIMessageStreamPart<UI_MESSAGE>);
        }),
      );
    }
  } catch (error) {
    safeEnqueue({
      type: 'error',
      errorText: onError(error),
    } as InferUIMessageStreamPart<UI_MESSAGE>);
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

  return handleUIMessageStreamFinish<UI_MESSAGE>({
    stream,
    messageId: generateId(),
    originalMessages,
    onFinish,
  });
}
