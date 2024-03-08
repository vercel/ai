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
  forwardRunStream: (
    stream: ReadableStream<
      | {
          event: 'thread.message.created';
          messageId: string;
          messageRole: string;
        }
      | {
          event: 'thread.message.delta';
          delta: string;
        }
      | {
          event: 'thread.run.requires_action' | 'thread.run.completed';
          data: any;
        }
    >,
  ) => Promise<any>;
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

      const forwardRunStream = async (
        stream: Parameters<
          Parameters<AssistantResponseCallback>[0]['forwardRunStream']
        >[0],
      ) => {
        const reader = stream.getReader();

        let result: any = undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          switch (value.event) {
            case 'thread.message.created': {
              controller.enqueue(
                textEncoder.encode(
                  formatStreamPart('assistant_message', {
                    id: value.messageId,
                    role: 'assistant',
                    content: [{ type: 'text', text: { value: '' } }],
                  }),
                ),
              );
              break;
            }

            case 'thread.message.delta': {
              controller.enqueue(
                textEncoder.encode(formatStreamPart('text', value.delta)),
              );
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
          forwardRunStream,
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
