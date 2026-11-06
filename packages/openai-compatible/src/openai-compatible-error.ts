import { createProviderStreamError } from '@ai-sdk/provider-utils';
import { z, type ZodType } from 'zod/v4';
export const openaiCompatibleErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),

    // The additional information below is handled loosely to support
    // OpenAI-compatible providers that have slightly different error
    // responses:
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

export type OpenAICompatibleErrorData = z.infer<
  typeof openaiCompatibleErrorDataSchema
>;

export type ProviderErrorStructure<T> = {
  errorSchema: ZodType<T>;
  errorToMessage: (error: T) => string;
  isRetryable?: (response: Response, error?: T) => boolean;
};

export const defaultOpenAICompatibleErrorStructure: ProviderErrorStructure<OpenAICompatibleErrorData> =
  {
    errorSchema: openaiCompatibleErrorDataSchema,
    errorToMessage: data => data.error.message,
  };

export function createOpenAICompatibleStreamError(error: unknown): unknown {
  if (
    typeof error !== 'object' ||
    error == null ||
    !('message' in error) ||
    typeof error.message !== 'string'
  ) {
    return error;
  }

  const { type, code } = error as { type?: unknown; code?: unknown };
  const metadata = getOpenAICompatibleStreamErrorMetadata([code, type]);

  if (metadata == null || isHttpStatusCode(code)) {
    return error;
  }

  return createProviderStreamError({
    message: error.message,
    type: typeof type === 'string' ? type : undefined,
    code:
      typeof code === 'string' || typeof code === 'number' ? code : undefined,
    ...metadata,
    data: error,
  });
}

function getOpenAICompatibleStreamErrorMetadata(
  discriminators: unknown[],
): { statusCode: number; isRetryable: boolean } | undefined {
  for (const discriminator of discriminators) {
    if (typeof discriminator !== 'string') {
      continue;
    }

    switch (discriminator.toLowerCase()) {
      case 'insufficient_quota':
        return { statusCode: 429, isRetryable: false };
      case 'rate_limit_exceeded':
      case 'rate_limit_error':
        return { statusCode: 429, isRetryable: true };
      case 'server_error':
      case 'api_error':
      case 'internal_error':
      case 'internal_server_error':
        return { statusCode: 500, isRetryable: true };
      case 'overloaded':
      case 'overloaded_error':
      case 'server_is_overloaded':
      case 'model_overloaded':
      case 'service_unavailable':
      case 'service_unavailable_error':
        return { statusCode: 503, isRetryable: true };
      case 'timeout':
      case 'timeout_error':
        return { statusCode: 504, isRetryable: true };
      case 'authentication_error':
      case 'invalid_api_key':
        return { statusCode: 401, isRetryable: false };
      case 'permission_error':
        return { statusCode: 403, isRetryable: false };
      case 'not_found_error':
      case 'model_not_found':
        return { statusCode: 404, isRetryable: false };
      case 'bad_request':
      case 'context_length_exceeded':
      case 'invalid_request_error':
        return { statusCode: 400, isRetryable: false };
    }
  }

  return undefined;
}

function isHttpStatusCode(value: unknown): boolean {
  const statusCode =
    typeof value === 'string' && /^\d{3}$/.test(value) ? Number(value) : value;

  return (
    typeof statusCode === 'number' &&
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode <= 599
  );
}
