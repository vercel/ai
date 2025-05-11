import { DataStreamPart } from '../data-stream';
import { TextUIPart, UIMessage } from './ui-messages';

export function constructUIMessages({
  newMessageId,
  originalMessages,
  uiMessageStream,
  onFinish,
}: {
  newMessageId: string | undefined;
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

  const lastMessage = originalMessages[originalMessages.length - 1];
  const isContinuation = lastMessage?.role === 'assistant';

  const responseMessage: UIMessage = isContinuation
    ? lastMessage
    : {
        id: newMessageId ?? 'TODO',
        role: 'assistant',
        parts: [],
      };

  let currentTextPart: TextUIPart | undefined = undefined;

  return uiMessageStream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (chunk.type === 'start') {
          chunk.value.messageId = responseMessage.id;
        }

        controller.enqueue(chunk);

        if (chunk.type === 'text') {
          if (currentTextPart == null) {
            currentTextPart = { type: 'text', text: chunk.value };
            responseMessage.parts.push(currentTextPart);
          } else {
            currentTextPart.text += chunk.value;
          }
        }
      },

      flush() {
        onFinish({
          isContinuation,
          responseMessage,
          messages: [
            ...(isContinuation
              ? originalMessages.slice(0, -1)
              : originalMessages),
            responseMessage,
          ],
        });
      },
    }),
  );
}
