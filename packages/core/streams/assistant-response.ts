import { AssistantStream } from 'openai/lib/AssistantStream';
import { formatStreamPart } from '../shared/stream-parts';
import { AssistantMessage, DataMessage } from '../shared/types';

type AssistantResponseSettings = {
  threadId: string;
  messageId: string;
};

type AssistantResponseCallback = (options: {
  threadId: string;
  messageId: string;
  sendMessage: (message: AssistantMessage) => void;
  sendDataMessage: (message: DataMessage) => void;
  forwardStream: (stream: AssistantStream) => Promise<any>;
}) => Promise<void>;

export function experimental_AssistantResponse(
  { threadId, messageId }: AssistantResponseSettings,
  process: AssistantResponseCallback,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const textEncoder = new TextEncoder();

      const sendMessage = (message: AssistantMessage) => {
        controller.enqueue(
          textEncoder.encode(formatStreamPart('assistant_message', message)),
        );
      };

      const sendDataMessage = (message: DataMessage) => {
        controller.enqueue(
          textEncoder.encode(formatStreamPart('data_message', message)),
        );
      };

      const sendError = (errorMessage: string) => {
        controller.enqueue(
          textEncoder.encode(formatStreamPart('error', errorMessage)),
        );
      };

      const forwardStream = async (stream: AssistantStream) => {
        let result: any = undefined;

        for await (const value of stream) {
          switch (value.event) {
            case 'thread.message.created': {
              controller.enqueue(
                textEncoder.encode(
                  formatStreamPart('assistant_message', {
                    id: value.data.id,
                    role: 'assistant',
                    content: [{ type: 'text', text: { value: '' } }],
                  }),
                ),
              );
              break;
            }

            case 'thread.message.delta': {
              const content = value.data.delta.content?.[0];

              if (content?.type === 'text' && content.text?.value != null) {
                controller.enqueue(
                  textEncoder.encode(
                    formatStreamPart('text', content.text.value),
                  ),
                );
              }

              break;
            }

            case 'thread.run.completed':
            case 'thread.run.requires_action': {
              result = value.data;
              break;
            }
          }
        }

        return result;
      };

      // send the threadId and messageId as the first message:
      controller.enqueue(
        textEncoder.encode(
          formatStreamPart('assistant_control_data', {
            threadId,
            messageId,
          }),
        ),
      );

      try {
        await process({
          threadId,
          messageId,
          sendMessage,
          sendDataMessage,
          forwardStream,
        });
      } catch (error) {
        sendError((error as any).message ?? `${error}`);
      } finally {
        controller.close();
      }
    },
    pull(controller) {},
    cancel() {},
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
