import { DataStreamPart } from '../data-stream';
import { createAsyncIterableStream } from '../util/async-iterable-stream';
import { processChatResponse } from './process-chat-response';
import { UIMessage } from './ui-messages';

export function constructUIMessages({
  newMessageId,
  originalMessages,
  uiMessageStream,
  onFinish,
}: {
  newMessageId: string;
  originalMessages: UIMessage[];
  uiMessageStream: ReadableStream<DataStreamPart>;
  onFinish: (options: {
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
}): ReadableStream<DataStreamPart> {
  if (onFinish == null) {
    return uiMessageStream;
  }

  return processChatResponse({
    stream: createAsyncIterableStream(uiMessageStream),
    lastMessage: originalMessages[originalMessages.length - 1],
    newMessageId,
    onFinish: ({ message, isContinuation }) => {
      onFinish({
        isContinuation,
        responseMessage: message,
        messages: [
          ...(isContinuation
            ? originalMessages.slice(0, -1)
            : originalMessages),
          message,
        ],
      });
    },
  });
}
