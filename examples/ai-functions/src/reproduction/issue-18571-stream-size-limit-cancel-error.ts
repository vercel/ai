import {
  DownloadError,
  readResponseWithSizeLimit,
} from '@ai-sdk/provider-utils';

const failureSignal =
  'ISSUE #18571 REPRODUCED: cancellation error replaced the streamed size-limit DownloadError';

async function main() {
  const cancelError = new Error('cancel failed');
  let cancelAttempted = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
    },
    cancel() {
      cancelAttempted = true;
      return Promise.reject(cancelError);
    },
  });

  const response = {
    headers: new Headers(),
    body,
  } as Response;

  let error: unknown;

  try {
    await readResponseWithSizeLimit({
      response,
      url: 'https://example.com/file',
      maxBytes: 1,
    });
  } catch (caughtError) {
    error = caughtError;
  }

  if (!cancelAttempted) {
    throw new Error('reader cancellation was not attempted');
  }

  if (body.locked) {
    throw new Error('reader lock was not released');
  }

  if (error === cancelError) {
    throw new Error(failureSignal);
  }

  if (!DownloadError.isInstance(error)) {
    throw new Error(`unexpected rejection: ${String(error)}`);
  }

  const expectedMessage =
    'Download of https://example.com/file exceeded maximum size of 1 bytes.';

  if (error.message !== expectedMessage) {
    throw new Error(
      `unexpected DownloadError message: ${JSON.stringify(error.message)}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
