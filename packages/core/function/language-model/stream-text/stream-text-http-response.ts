import { formatStreamPart } from '../../../shared/stream-parts';
import { COMPLEX_HEADER } from '../../../shared/utils';
import { LanguageModelStreamPart } from '../language-model';

export class StreamTextHttpResponse extends Response {
  constructor(messageStream: ReadableStream<LanguageModelStreamPart>) {
    super(
      messageStream.pipeThrough(
        new TransformStream<LanguageModelStreamPart, string>({
          transform(chunk, controller) {
            switch (chunk.type) {
              case 'text-delta': {
                controller.enqueue(formatStreamPart('text', chunk.textDelta));
                break;
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
