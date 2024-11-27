import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { DataStream } from './data-stream';

export function createDataStream(
  callback: (dataStream: DataStream) => PromiseLike<void> | void,
): ReadableStream<string> {
  let controller: ReadableStreamDefaultController<string>;

  const ongoingStreamPromises: Promise<void>[] = [];

  const stream = new ReadableStream({
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
    forward(streamArg) {
      ongoingStreamPromises.push(
        (async () => {
          const reader = streamArg.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        })(),
      );
    },
  });

  // TODO error handling
  Promise.all(ongoingStreamPromises).finally(() => {
    controller!.close();
  });

  return stream;
}
