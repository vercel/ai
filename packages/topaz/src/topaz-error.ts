import { AISDKError } from '@ai-sdk/provider';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

/**
 * Topaz reports errors as `{ "detail": ... }`, where `detail` is either a
 * message or FastAPI's array of validation issues. `message` and `error` are
 * accepted as well because a few endpoints use them instead.
 */
export const topazErrorDataSchema = z.object({
  detail: z
    .union([
      z.string(),
      z.array(z.object({ msg: z.string().nullish() }).loose()),
    ])
    .nullish(),
  message: z.string().nullish(),
  error: z.string().nullish(),
});

export type TopazErrorData = z.infer<typeof topazErrorDataSchema>;

export function topazErrorToMessage(data: TopazErrorData): string {
  const { detail } = data;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map(issue => issue.msg)
      .filter((msg): msg is string => msg != null);

    if (messages.length > 0) {
      return messages.join('; ');
    }
  }

  return data.message ?? data.error ?? 'Unknown Topaz API error';
}

export const topazFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: topazErrorDataSchema,
  errorToMessage: topazErrorToMessage,
});

const name = 'AI_TopazError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class TopazError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  constructor({ message, cause }: { message: string; cause?: unknown }) {
    super({ name, message, cause });
  }

  static isInstance(error: unknown): error is TopazError {
    return AISDKError.hasMarker(error, marker);
  }
}
