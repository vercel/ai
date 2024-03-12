import { formatStreamPart } from '../../shared/stream-parts';
import { COMPLEX_HEADER } from '../../shared/utils';
import { TextStreamPart } from './stream-text';

export class StreamTextHttpResponse extends Response {
  constructor(messageStream: ReadableStream<TextStreamPart<any>>) {
    super(
      messageStream.pipeThrough(
        new TransformStream<TextStreamPart<any>, string>({
          transform(chunk, controller) {
            switch (chunk.type) {
              case 'error': {
                // TODO forward errors to the client
                // controller.error(chunk.error);
                break;
              }

              case 'text-delta': {
                controller.enqueue(formatStreamPart('text', chunk.textDelta));
                break;
              }

              case 'tool-call': {
                // TODO need a way to send single tool calls to the client

                controller.enqueue(
                  formatStreamPart('tool_calls', {
                    tool_calls: [
                      {
                        type: 'function',
                        id: chunk.toolCallId ?? '', // TODO client need to support null id
                        function: {
                          name: chunk.toolName,
                          arguments: JSON.stringify(chunk.args),
                        },
                      },
                    ],
                  }),
                );
                break;
              }

              case 'tool-result': {
                // ignored
                break;
              }

              default: {
                const exhaustiveCheck: never = chunk;
                throw new Error(
                  `Unhandled stream part type: ${exhaustiveCheck}`,
                );
              }
            }
          },
        }),
      ),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          [COMPLEX_HEADER]: 'true',
        },
      },
    );
  }
}
