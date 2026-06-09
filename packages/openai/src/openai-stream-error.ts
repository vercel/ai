import { APICallError } from '@ai-sdk/provider';
import type { ParseResult } from '@ai-sdk/provider-utils';

type StreamError = {
  message: string;
  code?: string | number | null;
  type?: string | null;
  param?: unknown;
  sequenceNumber?: unknown;
  frame: unknown;
};

export async function throwIfOpenAIStreamErrorBeforeOutput<T>({
  stream,
  getError,
  isOutputChunk,
  url,
  requestBodyValues,
  responseHeaders,
}: {
  stream: ReadableStream<ParseResult<T>>;
  getError: (chunk: T) => unknown | undefined;
  isOutputChunk: (chunk: T) => boolean;
  url: string;
  requestBodyValues: unknown;
  responseHeaders?: Record<string, string>;
}): Promise<ReadableStream<ParseResult<T>>> {
  const [streamForEarlyError, streamForConsumer] = stream.tee();
  const reader = streamForEarlyError.getReader();

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        return streamForConsumer;
      }

      const chunk = result.value;

      if (!chunk.success) {
        return streamForConsumer;
      }

      const errorFrame = getError(chunk.value);

      if (errorFrame != null) {
        streamForConsumer.cancel().catch(() => {});
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
    }
  } finally {
    reader.cancel().catch(() => {});
    reader.releaseLock();
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
  const apiCallError = new APICallError({
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

  if (streamError != null) {
    debugOpenAIStreamError({ apiCallError, streamError, responseHeaders });
  }

  return apiCallError;
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
          sequenceNumber: value.sequence_number,
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
        param: error.param,
        sequenceNumber: value.sequence_number,
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

function debugOpenAIStreamError({
  apiCallError,
  streamError,
  responseHeaders,
}: {
  apiCallError: APICallError;
  streamError: StreamError;
  responseHeaders?: Record<string, string>;
}) {
  const env = (globalThis as { process?: { env?: Record<string, string> } })
    .process?.env;

  if (env?.AI_SDK_OPENAI_STREAM_DEBUG !== '1') {
    return;
  }

  const headers = Object.fromEntries(
    ['x-request-id', 'openai-processing-ms', 'retry-after', 'retry-after-ms']
      .filter(header => responseHeaders?.[header] != null)
      .map(header => [header, responseHeaders![header]]),
  );

  console.warn(
    '[AI SDK][OpenAI] early stream error',
    JSON.stringify({
      message: apiCallError.message,
      statusCode: apiCallError.statusCode,
      isRetryable: apiCallError.isRetryable,
      code: streamError.code,
      type: streamError.type,
      param: streamError.param,
      sequenceNumber: streamError.sequenceNumber,
      responseHeaders: Object.keys(headers).length > 0 ? headers : undefined,
      frame: sanitizeDebugFrame(streamError.frame),
    }),
  );
}

function sanitizeDebugFrame(frame: unknown): unknown {
  const value = asRecord(frame);

  if (value?.type !== 'response.failed') {
    return frame;
  }

  const response = asRecord(value.response);

  return {
    type: value.type,
    sequence_number: value.sequence_number,
    response: {
      id: response?.id,
      object: response?.object,
      status: response?.status,
      model: response?.model,
      error: response?.error,
      incomplete_details: response?.incomplete_details,
      service_tier: response?.service_tier,
    },
  };
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
