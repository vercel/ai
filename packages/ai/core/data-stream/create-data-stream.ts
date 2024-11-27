import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { DataStream } from './data-stream';

export function createDataStream(
  callback: (dataStream: DataStream) => PromiseLike<void> | void,
): ReadableStream<string> {
  let controller: ReadableStreamDefaultController<string>;

  const stream1 = new ReadableStream({
    start(controllerArg) {
      controller = controllerArg;
    },
  });

  callback({
    appendData(data) {
      controller.enqueue(formatDataStreamPart('data', [data]));
    },
    appendMessageAnnotation(annotation) {
      controller.enqueue(
        formatDataStreamPart('message_annotations', [annotation]),
      );
    },
    forward() {},
  });

  controller!.close();

  return stream1;
}
