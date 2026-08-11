import {
  DownloadError,
  readResponseWithSizeLimit,
} from '../../../../packages/provider-utils/src';

const BUG_SIGNAL =
  'ISSUE #18571 REPRODUCED: streamed size-limit DownloadError was replaced by cancellation error "cancel failed"';
const URL = 'https://example.com/file';
const MAX_BYTES = 1;
const EXPECTED_MESSAGE = `Download of ${URL} exceeded maximum size of ${MAX_BYTES} bytes.`;

async function verifyContentLengthComparison() {
  let cancelAttempted = false;

  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelAttempted = true;
      return Promise.reject(new Error('content-length cancel failed'));
    },
  });
  const response = {
    headers: new Headers({ 'content-length': '2' }),
    body,
  } as Response;

  let observedError: unknown;

  try {
    await readResponseWithSizeLimit({
      response,
      url: URL,
      maxBytes: MAX_BYTES,
    });
  } catch (error) {
    observedError = error;
  }

  if (!cancelAttempted) {
    throw new Error(
      'Unexpected comparison behavior: Content-Length cancellation was not attempted',
    );
  }

  if (
    !DownloadError.isInstance(observedError) ||
    observedError.message !==
      `Download of ${URL} exceeded maximum size of ${MAX_BYTES} bytes (Content-Length: 2).`
  ) {
    throw new Error(
      'Unexpected comparison behavior: Content-Length path did not preserve its DownloadError',
      { cause: observedError },
    );
  }
}

async function main() {
  await verifyContentLengthComparison();

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

  let observedError: unknown;

  try {
    await readResponseWithSizeLimit({
      response,
      url: URL,
      maxBytes: MAX_BYTES,
    });
    throw new Error(
      'Unexpected success: oversized streamed response was accepted',
    );
  } catch (error) {
    observedError = error;
  }

  if (!cancelAttempted) {
    throw new Error(
      'Unexpected behavior: reader cancellation was not attempted',
    );
  }

  if (body.locked) {
    throw new Error('Unexpected behavior: reader lock was not released');
  }

  if (observedError === cancelError) {
    console.error(BUG_SIGNAL);
    process.exitCode = 1;
    return;
  }

  if (
    DownloadError.isInstance(observedError) &&
    observedError.message === EXPECTED_MESSAGE
  ) {
    console.log(
      'Issue #18571 is fixed: cancellation was attempted, the reader lock was released, and the DownloadError was preserved.',
    );
    return;
  }

  throw new Error('Unexpected rejection from readResponseWithSizeLimit', {
    cause: observedError,
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
