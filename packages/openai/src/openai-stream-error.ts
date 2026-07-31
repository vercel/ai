import { APICallError } from '@ai-sdk/provider';
import type { ParseResult } from '@ai-sdk/provider-utils';

type StreamError = {
  message: string;
  code?: string | number | null;
  type?: string | null;
  frame: unknown;
};

export async function throwIfOpenAIStreamErrorBeforeOutput<T>({
  stream,
  getError,
  isOutputChunk,
  isAcceptedChunk,
  acceptedGraceMs = 50,
  url,
  requestBodyValues,
  responseHeaders,
}: {
  stream: ReadableStream<ParseResult<T>>;
  getError: (chunk: T) => unknown | undefined;
  isOutputChunk: (chunk: T) => boolean;
  /**
   * Marks a chunk that proves the request was accepted and generation has
   * started (e.g. the Responses API `response.in_progress` event). Once seen,
   * the early-error peek stops blocking indefinitely: each subsequent read is
   * raced against `acceptedGraceMs` so error frames that are flushed together
   * with the accepted chunk (e.g. `insufficient_quota`) still throw, while a
   * healthy stream becomes available without waiting for the first output
   * token.
   */
  isAcceptedChunk?: (chunk: T) => boolean;
  /**
   * How long to keep peeking for an error frame after an accepted chunk was
   * seen. Only used when `isAcceptedChunk` is provided.
   */
  acceptedGraceMs?: number;
  url: string;
  requestBodyValues: unknown;
  responseHeaders?: Record<string, string>;
}): Promise<ReadableStream<ParseResult<T>>> {
  const [streamForEarlyError, streamForConsumer] = stream.tee();
  const reader = streamForEarlyError.getReader();
  let drainAfterError = false;

  try {
    let accepted = false;

    while (true) {
      let result: ReadableStreamReadResult<ParseResult<T>>;

      if (accepted) {
        const raced = await raceWithTimeout(reader.read(), acceptedGraceMs);
        if (raced.timedOut) {
          return streamForConsumer;
        }
        result = raced.value;
      } else {
        result = await reader.read();
      }

      if (result.done) {
        return streamForConsumer;
      }

      const chunk = result.value;

      if (!chunk.success) {
        return streamForConsumer;
      }

      const errorFrame = getError(chunk.value);

      if (errorFrame != null) {
        // Let the source finish instead of cancelling its transform pipeline.
        // Node.js 26 can otherwise leave a queued pipe write rejected with
        // the cancellation reason after the API error has already surfaced.
        drainAfterError = true;
        drainReader(reader).catch(() => {});
        drainReader(streamForConsumer.getReader()).catch(() => {});
        throw createOpenAIStreamError({
          frame: errorFrame,
          url,
          requestBodyValues,
          responseHeaders,
        });
      }

      if (isOutputChunk(chunk.value)) {
        return streamForConsumer;
      }

      if (!accepted && isAcceptedChunk?.(chunk.value) === true) {
        accepted = true;
      }
    }
  } finally {
    if (!drainAfterError) {
      reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

async function drainReader<T>(
  reader: ReadableStreamDefaultReader<T>,
): Promise<void> {
  try {
    while (!(await reader.read()).done) {
      // Drain the source without retaining its remaining chunks.
    }
  } catch {
    // The API error has already been reported to the caller.
  } finally {
    reader.releaseLock();
  }
}

async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = promise.then(value => ({ timedOut: false as const, value }));
  try {
    const raced = await Promise.race([
      wrapped,
      new Promise<{ timedOut: true }>(resolve => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      }),
    ]);
    if (raced.timedOut) {
      // The losing read settles later (typically when the peek branch is
      // cancelled after the stream is handed to the consumer, or rejects if
      // the source errors). Adopt it so it can never surface as an
      // unhandled rejection; the consumer branch sees the same outcome.
      wrapped.catch(() => {});
    }
    return raced;
  } finally {
    clearTimeout(timer);
  }
}

function createOpenAIStreamError({
  frame,
  url,
  requestBodyValues,
  responseHeaders,
}: {
  frame: unknown;
  url: string;
  requestBodyValues: unknown;
  responseHeaders?: Record<string, string>;
}): APICallError {
  const streamError = parseStreamError(frame);
  return new APICallError({
    message:
      streamError?.message ??
      'OpenAI stream failed before any output was generated',
    url,
    requestBodyValues,
    statusCode: streamError == null ? 500 : getStatusCode(streamError),
    responseHeaders,
    responseBody: JSON.stringify(frame),
    data: frame,
  });
}

function parseStreamError(frame: unknown): StreamError | undefined {
  const value = asRecord(frame);

  if (value == null) {
    return undefined;
  }

  if (value.type === 'response.failed') {
    const response = asRecord(value.response);
    const responseError = asRecord(response?.error);

    return typeof responseError?.message === 'string'
      ? {
          message: responseError.message,
          code: getStringOrNumber(responseError.code),
          type: 'response.failed',
          frame,
        }
      : undefined;
  }

  const error = asRecord(value.error) ?? value;

  return typeof error.message === 'string' &&
    (asRecord(value.error) != null ||
      typeof error.type === 'string' ||
      'code' in error ||
      'param' in error)
    ? {
        message: error.message,
        code: getStringOrNumber(error.code),
        type: typeof error.type === 'string' ? error.type : undefined,
        frame,
      }
    : undefined;
}

function getStatusCode(error: StreamError): number {
  if (typeof error.code === 'number' && isHttpErrorStatusCode(error.code)) {
    return error.code;
  }

  if (typeof error.code === 'string' && /^\d{3}$/.test(error.code)) {
    const numericCode = Number(error.code);
    if (isHttpErrorStatusCode(numericCode)) {
      return numericCode;
    }
  }

  const discriminator = [error.code, error.type]
    .filter(value => typeof value === 'string' || typeof value === 'number')
    .join(' ')
    .toLowerCase();

  if (
    ['insufficient_quota', 'rate_limit'].some(term =>
      discriminator.includes(term),
    )
  ) {
    return 429;
  }
  if (discriminator.includes('authentication')) return 401;
  if (discriminator.includes('permission')) return 403;
  if (discriminator.includes('not_found')) return 404;
  if (
    ['invalid', 'bad_request', 'context_length'].some(term =>
      discriminator.includes(term),
    )
  ) {
    return 400;
  }
  if (discriminator.includes('overload')) return 503;
  if (discriminator.includes('timeout')) return 504;

  return 500;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value != null
    ? (value as Record<string, unknown>)
    : undefined;
}

function getStringOrNumber(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : undefined;
}

function isHttpErrorStatusCode(value: number): boolean {
  return Number.isInteger(value) && value >= 400 && value <= 599;
}
