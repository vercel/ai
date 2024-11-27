import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import { DataStream } from './data-stream';

export function createDataStream({
  execute,
  onError = () => 'An error occurred.', // mask error messages for safety by default
}: {
  execute: (dataStream: DataStream) => PromiseLike<void> | void;
  onError?: (error: unknown) => string;
}): ReadableStream<string> {
  let controller: ReadableStreamDefaultController<string>;

  const ongoingStreamPromises: Promise<void>[] = [];

  const stream = new ReadableStream({
    start(controllerArg) {
      controller = controllerArg;
    },
  });

  try {
    execute({
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
  } catch (error) {
    controller!.enqueue(formatDataStreamPart('error', onError(error)));
  }

  Promise.all(
    ongoingStreamPromises.map(promise =>
      promise.catch(error => {
        controller.enqueue(formatDataStreamPart('error', onError(error)));
      }),
    ),
  ).finally(() => {
    controller!.close();
  });

  return stream;
}
