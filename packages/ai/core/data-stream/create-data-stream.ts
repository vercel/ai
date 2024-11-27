import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { DataStream } from './data-stream';

export function createDataStream(
  callback: (dataStream: DataStream) => PromiseLike<void> | void,
): ReadableStream<string> {
  let stream1Controller: ReadableStreamDefaultController<string> | undefined;

  const stream1 = new ReadableStream({
    start(controller) {
      stream1Controller = controller;
    },
  });

  callback({
    appendMessageAnnotation() {},
    appendData(data) {
      stream1Controller!.enqueue(formatDataStreamPart('data', [data]));
    },
    forward() {},
  });

  stream1Controller!.close();

  return stream1;
}
