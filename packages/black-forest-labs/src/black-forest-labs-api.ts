import {
  createJsonErrorResponseHandler,
  isSameOrigin,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Transport concerns shared by every Black Forest Labs model
 */

export const bflErrorSchema = z.object({
  message: z.string().optional(),
  detail: z.any().optional(),
  status: z.string().nullish(),
  state: z.string().nullish(),
});

function bflErrorToMessage(error: unknown): string | undefined {
  const parsed = bflErrorSchema.safeParse(error);
  if (!parsed.success) return undefined;
  const { message, detail } = parsed.data;
  if (typeof detail === 'string') return detail;
  if (detail != null) {
    try {
      return JSON.stringify(detail);
    } catch {
      // ignore
    }
  }
  return message;
}

export const bflFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: bflErrorSchema,
  errorToMessage: error =>
    bflErrorToMessage(error) ??
    ((error.status ?? error.state) != null
      ? `Black Forest Labs generation failed: ${error.status ?? error.state}.`
      : 'Unknown Black Forest Labs error'),
  isRetryable: (response, error) => {
    // Failed tasks can use HTTP 503; resubmitting them starts a new generation.
    if (
      [
        'Content Moderated',
        'Error',
        'Failed',
        'Request Moderated',
        'Task not found',
      ].includes(error?.status ?? error?.state ?? '')
    ) {
      return false;
    }
    return (
      response.status === 408 ||
      response.status === 409 ||
      response.status === 429 ||
      response.status >= 500
    );
  },
});

/**
 * Black Forest Labs returns response-supplied polling URLs on
 * sibling cluster hosts of the API origin (e.g. `api.us1.bfl.ai` for a base
 * URL on `api.bfl.ai`), so a strict same-origin check against the configured
 * base URL is not enough. Credentials may also be sent to any https host under
 * the official `bfl.ai` domain.
 */
export function isTrustedUrl(url: string, baseUrl: string): boolean {
  if (isSameOrigin(url, baseUrl)) {
    return true;
  }

  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === 'https:' &&
      (hostname === 'bfl.ai' || hostname.endsWith('.bfl.ai'))
    );
  } catch {
    return false;
  }
}
