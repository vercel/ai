import { UIMessageStreamPart } from './ui-message-stream-parts';
import { UIMessageStreamWriter } from './ui-message-stream-writer';

export function createUIMessageStream({
  execute,
  onError = () => 'An error occurred.', // mask error messages for safety by default
}: {
  execute: (writer: UIMessageStreamWriter) => Promise<void> | void;
  onError?: (error: unknown) => string;
}): ReadableStream<UIMessageStreamPart> {
  let controller!: ReadableStreamDefaultController<UIMessageStreamPart>;

  const ongoingStreamPromises: Promise<void>[] = [];

  const stream = new ReadableStream({
    start(controllerArg) {
      controller = controllerArg;
    },
  });

  function safeEnqueue(data: UIMessageStreamPart) {
    try {
      controller.enqueue(data);
    } catch (error) {
      // suppress errors when the stream has been closed
    }
  }

  try {
    const result = execute({
      write(part: UIMessageStreamPart) {
        safeEnqueue(part);
      },
      merge(streamArg) {
        ongoingStreamPromises.push(
          (async () => {
            const reader = streamArg.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              safeEnqueue(value);
            }
          })().catch(error => {
            safeEnqueue({ type: 'error', value: onError(error) });
          }),
        );
      },
      onError,
    });

    if (result) {
      ongoingStreamPromises.push(
        result.catch(error => {
          safeEnqueue({ type: 'error', value: onError(error) });
        }),
      );
    }
  } catch (error) {
    safeEnqueue({ type: 'error', value: onError(error) });
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
    try {
      controller.close();
    } catch (error) {
      // suppress errors when the stream has been closed
    }
  });

  return stream;
}
