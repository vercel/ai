import { APICallError } from '@ai-sdk/provider';
import {
  extractResponseHeaders,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const gradiumErrorDataSchema = z.object({
  error: z
    .object({
      message: z.string(),
      type: z.string().optional(),
      code: z.union([z.string(), z.number()]).optional(),
    })
    .or(z.string())
    .optional(),
  message: z.string().optional(),
  detail: z.string().optional(),
});

export type GradiumErrorData = z.infer<typeof gradiumErrorDataSchema>;

function extractMessage(parsed: GradiumErrorData): string | null {
  if (typeof parsed.error === 'string') return parsed.error;
  if (parsed.error?.message) return parsed.error.message;
  if (parsed.message) return parsed.message;
  if (parsed.detail) return parsed.detail;
  return null;
}

// Gradium currently returns HTTP 500 for auth failures with a plain-text body
// like `error from server Some(1008): API key is revoked or expired`. The AI
// SDK retries 5xx responses by default, which wastes ~7s on permanent failures.
// Recognise the auth signature so we mark those non-retryable.
const PERMANENT_ERROR_PATTERNS = [
  /Some\(1008\)/i,
  /api\s*key/i,
  /revoked/i,
  /expired/i,
  /unauthori[sz]ed/i,
  /forbidden/i,
];

function isPermanentByStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 404;
}

export const gradiumFailedResponseHandler: ResponseHandler<
  APICallError
> = async ({ response, url, requestBodyValues }) => {
  const responseHeaders = extractResponseHeaders(response);
  const responseBody = await response.text();

  let message: string | null = null;
  let parsed: GradiumErrorData | undefined;

  if (responseBody.length > 0) {
    try {
      const json = JSON.parse(responseBody);
      const result = gradiumErrorDataSchema.safeParse(json);
      if (result.success) {
        parsed = result.data;
        message = extractMessage(result.data);
      }
    } catch {
      // Not JSON — fall through to plain-text path.
    }

    // Plain-text body, or JSON without a recognised message field.
    // Strip trailing support-link cruft Gradium appends to error bodies.
    if (message == null) {
      message = responseBody
        .split(/\r?\n/)[0]!
        .replace(/^error from server\s+/i, '')
        .trim();
    }
  }

  if (!message) message = response.statusText || 'Unknown Gradium error';

  const permanent =
    isPermanentByStatus(response.status) ||
    PERMANENT_ERROR_PATTERNS.some(rx => rx.test(responseBody));

  return {
    responseHeaders,
    value: new APICallError({
      message,
      url,
      requestBodyValues,
      statusCode: response.status,
      responseHeaders,
      responseBody,
      isRetryable: !permanent,
      data: parsed,
    }),
  };
};
