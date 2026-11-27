import { createProviderStreamError } from '@ai-sdk/provider-utils';

type StreamError = {
  message: string;
  type?: string | null;
  code?: string | number | null;
};

/**
 * Adds status and retry metadata to an in-stream error frame when its `type` or
 * `code` identifies a transient condition. Other providers' error vocabularies
 * are unknown, so unrecognized frames are returned unchanged and left to the
 * default handling in AI SDK Core.
 */
export function classifyOpenAICompatibleStreamError<T extends StreamError>(
  error: T,
): T | ReturnType<typeof createProviderStreamError> {
  const statusCode = getTransientStatusCode(error);

  if (statusCode == null) {
    return error;
  }

  return createProviderStreamError({
    message: error.message,
    type: error.type ?? undefined,
    code: error.code ?? undefined,
    statusCode,
    isRetryable: true,
    data: error,
  });
}

function getTransientStatusCode({ type, code }: StreamError) {
  const discriminator = [type, code]
    .filter(value => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  // Permanent: retrying won't help even when the frame also looks like a rate limit.
  if (discriminator.includes('insufficient_quota')) return undefined;

  if (discriminator.includes('rate_limit')) return 429;
  if (
    discriminator.includes('overload') ||
    discriminator.includes('service_unavailable')
  ) {
    return 503;
  }
  if (discriminator.includes('timeout')) return 504;
  if (
    ['server_error', 'internal_error', 'api_error'].some(term =>
      discriminator.includes(term),
    )
  ) {
    return 500;
  }

  return undefined;
}
