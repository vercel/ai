import { APICallError, generateText } from 'ai';

const failureSignal =
  'ISSUE_22687_REPRODUCED: retry backoff replaced caller TimeoutError with AbortError: Delay was aborted';

async function main() {
  const controller = new AbortController();
  const reason = new DOMException(
    'Application deadline expired',
    'TimeoutError',
  );
  let calls = 0;
  let actual: unknown;

  try {
    await generateText({
      prompt: 'Hello',
      maxRetries: 1,
      abortSignal: controller.signal,
      model: {
        specificationVersion: 'v4',
        provider: 'mock',
        modelId: 'mock',
        supportedUrls: {},
        async doGenerate() {
          calls++;
          setTimeout(() => controller.abort(reason), 10);

          throw new APICallError({
            message: 'Retry me',
            url: 'https://example.invalid',
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
          });
        },
        async doStream() {
          throw new Error('Reproduction setup failed: doStream was called');
        },
      },
    });
  } catch (error) {
    actual = error;
  }

  if (calls !== 1) {
    throw new Error(
      `Reproduction setup failed: expected 1 call, received ${calls}`,
    );
  }

  if (controller.signal.reason !== reason) {
    throw new Error(
      'Reproduction setup failed: AbortSignal did not retain its reason',
    );
  }

  if (actual === reason) {
    console.log('Caller abort reason was preserved.');
    return;
  }

  const cause =
    typeof actual === 'object' && actual !== null && 'cause' in actual
      ? actual.cause
      : undefined;

  if (
    actual instanceof DOMException &&
    actual.name === 'AbortError' &&
    actual.message === 'Delay was aborted' &&
    cause === undefined
  ) {
    throw new Error(failureSignal);
  }

  throw new Error(
    `Unexpected rejection instead of caller abort reason: ${String(actual)}`,
  );
}

main();
