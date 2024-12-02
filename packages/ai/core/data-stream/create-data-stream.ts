import { DataStreamString, formatDataStreamPart } from '@ai-sdk/ui-utils';
import { DataStreamWriter } from './data-stream-writer';

export function createDataStream({
  execute,
  onError = () => 'An error occurred.', // mask error messages for safety by default
}: {
  execute: (dataStream: DataStreamWriter) => Promise<void> | void;
  onError?: (error: unknown) => string;
}): ReadableStream<DataStreamString> {
  let controller: ReadableStreamDefaultController<string>;

  const ongoingStreamPromises: Promise<void>[] = [];

  const stream = new ReadableStream({
    start(controllerArg) {
      controller = controllerArg;
    },
  });

  try {
    const result = execute({
      writeData(data) {
        controller.enqueue(formatDataStreamPart('data', [data]));
      },
      writeMessageAnnotation(annotation) {
        controller.enqueue(
          formatDataStreamPart('message_annotations', [annotation]),
        );
      },
      merge(streamArg) {
        ongoingStreamPromises.push(
          (async () => {
            const reader = streamArg.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          })().catch(error => {
            controller.enqueue(formatDataStreamPart('error', onError(error)));
          }),
        );
      },
      onError,
    });

    if (result) {
      ongoingStreamPromises.push(
        result.catch(error => {
          controller.enqueue(formatDataStreamPart('error', onError(error)));
        }),
      );
    }
  } catch (error) {
    controller!.enqueue(formatDataStreamPart('error', onError(error)));
  }

  // Wait until all ongoing streams are done. This approach enables merging
  // streams even after execute has returned, as long as there is still an
  // open merged stream. This is important to e.g. forward new streams and
  // from callbacks.
  const waitForStreams: Promise<void> = new Promise(async resolve => {
    while (ongoingStreamPromises.length > 0) {
      await ongoingStreamPromises.shift();
    }
    resolve();
  });

  waitForStreams.finally(() => {
    controller!.close();
  });

  return stream;
}
