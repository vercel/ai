import type { ParseResult } from '@ai-sdk/provider-utils';

export type GoogleStreamPart<T> =
  | ParseResult<T>
  | { type: 'continuation-start' };

/**
 * Concatenates the event streams of a long decode response that spans several
 * requests (Gemini 4 long decode).
 *
 * Events of the current stream are passed through unchanged. When an event
 * signals that the per-request cap was reached while budget remains
 * (`getContinuationToken` returns a token), the next request is sent with that
 * token once the current stream ends, and its events are appended after a
 * `continuation-start` marker. The marker orders per-response state changes
 * with buffered events, including when the new stream is empty. If the
 * continuation request fails, the error is emitted as a failed parse result
 * and the stream ends.
 */
export function continueGoogleStream<T>({
  stream,
  getContinuationToken,
  continueStream,
}: {
  stream: ReadableStream<ParseResult<T>>;
  getContinuationToken: (value: T) => string | undefined;
  continueStream: (
    continuationToken: string,
  ) => Promise<ReadableStream<ParseResult<T>>>;
}): ReadableStream<GoogleStreamPart<T>> {
  let reader = stream.getReader();
  let pendingContinuationToken: string | undefined;

  return new ReadableStream<GoogleStreamPart<T>>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();

        if (!done) {
          if (value.success) {
            const token = getContinuationToken(value.value);
            if (token != null) {
              pendingContinuationToken = token;
            }
          }
          controller.enqueue(value);
          return;
        }

        if (pendingContinuationToken == null) {
          controller.close();
          return;
        }

        const continuationToken = pendingContinuationToken;
        pendingContinuationToken = undefined;

        try {
          reader = (await continueStream(continuationToken)).getReader();
          controller.enqueue({ type: 'continuation-start' });
          return;
        } catch (error) {
          // Surfaced as an `error` stream part, followed by the `finish` part
          // with the last continuation token so the caller can resume.
          controller.enqueue({
            success: false,
            error: error as Extract<
              ParseResult<T>,
              { success: false }
            >['error'],
            rawValue: undefined,
          });
          controller.close();
          return;
        }
      }
    },

    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}
