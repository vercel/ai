import assert from 'node:assert/strict';
import {
  DownloadError,
  readResponseWithSizeLimit,
  // @ts-expect-error provider-utils is available transitively in this reproduction workspace.
} from '@ai-sdk/provider-utils';

const url = 'https://example.com/file';
const maxBytes = 1;
const expectedMessage = `Download of ${url} exceeded maximum size of ${maxBytes} bytes.`;
const reproductionSignal =
  'ISSUE #18571 REPRODUCED: cancellation error replaced the streamed size-limit DownloadError';

async function main() {
  const contentLengthCancelError = new Error('content-length cancel failed');
  const contentLengthBody = new ReadableStream<Uint8Array>({
    cancel() {
      return Promise.reject(contentLengthCancelError);
    },
  });

  const contentLengthError = await readResponseWithSizeLimit({
    response: {
      headers: new Headers({ 'content-length': '2' }),
      body: contentLengthBody,
    } as Response,
    url,
    maxBytes,
  }).then(
    () => undefined,
    (error: unknown) => error,
  );

  assert.ok(
    DownloadError.isInstance(contentLengthError),
    'The Content-Length path must preserve its size-limit DownloadError when cancellation fails.',
  );

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

  const streamedError = await readResponseWithSizeLimit({
    response: {
      headers: new Headers(),
      body,
    } as Response,
    url,
    maxBytes,
  }).then(
    () => undefined,
    (error: unknown) => error,
  );

  assert.ok(cancelAttempted, 'Stream cancellation was not attempted.');
  assert.equal(body.locked, false, 'The reader lock was not released.');

  if (DownloadError.isInstance(streamedError)) {
    assert.equal(streamedError.message, expectedMessage);
    console.log(
      'Issue #18571 is fixed: the streamed DownloadError was preserved.',
    );
    return;
  }

  if (streamedError === cancelError) {
    console.error(reproductionSignal);
    process.exitCode = 1;
    return;
  }

  throw new Error('Unexpected rejection from readResponseWithSizeLimit.', {
    cause: streamedError,
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
