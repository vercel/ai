import {
  createStreamingUIMessageState,
  processUIMessageStream,
  StreamingUIMessageState,
} from '../ui/process-ui-message-stream';
import {
  InferUIMessageData,
  InferUIMessageMetadata,
  UIMessage,
} from '../ui/ui-messages';
import { UIMessageStreamPart } from './ui-message-stream-parts';

export function handleUIMessageStreamFinish<UI_MESSAGE extends UIMessage>({
  newMessageId,
  originalMessages = [],
  onFinish,
  stream,
}: {
  stream: ReadableStream<UIMessageStreamPart>;

  newMessageId: string;

  /**
   * The original messages.
   */
  originalMessages?: UIMessage[];

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
}) {
  if (onFinish == null) {
    return stream;
  }

  const lastMessage = originalMessages[originalMessages.length - 1];
  const isContinuation = lastMessage?.role === 'assistant';
  const messageId = isContinuation ? lastMessage.id : newMessageId;

  const state = createStreamingUIMessageState<
    InferUIMessageMetadata<UI_MESSAGE>,
    InferUIMessageData<UI_MESSAGE>
  >({
    lastMessage: structuredClone(lastMessage) as any,
    newMessageId: messageId,
  });

  const runUpdateMessageJob = async (
    job: (options: {
      state: StreamingUIMessageState<
        UIMessage<
          InferUIMessageMetadata<UI_MESSAGE>,
          InferUIMessageData<UI_MESSAGE>
        >
      >;
      write: () => void;
    }) => Promise<void>,
  ) => {
    await job({ state, write: () => {} });
  };

  return processUIMessageStream<UI_MESSAGE>({
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
          responseMessage: state.message as UI_MESSAGE,
          messages: [
            ...(isContinuation
              ? originalMessages.slice(0, -1)
              : originalMessages),
            state.message,
          ] as UI_MESSAGE[],
        });
      },
    }),
  );
}
