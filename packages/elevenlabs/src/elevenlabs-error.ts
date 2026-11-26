import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';

/**
 * ElevenLabs reports errors under `detail`: an object for API errors, FastAPI's
 * array of validation issues for malformed requests, or a plain string.
 */
export const elevenlabsErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.union([
      z.object({
        detail: z.union([
          z
            .object({
              message: z.string(),
              code: z.string().nullish(),
              status: z.string().nullish(),
              type: z.string().nullish(),
              request_id: z.string().nullish(),
              param: z.string().nullish(),
            })
            .loose(),
          z.array(
            z
              .object({
                msg: z.string(),
                loc: z.array(z.union([z.string(), z.number()])).nullish(),
                type: z.string().nullish(),
              })
              .loose(),
          ),
          z.string(),
        ]),
      }),
      z.object({
        error: z.object({
          message: z.string(),
          code: z.number(),
        }),
      }),
    ]),
  ),
);

export type ElevenLabsErrorData = InferSchema<typeof elevenlabsErrorDataSchema>;

function elevenlabsErrorToMessage(data: ElevenLabsErrorData): string {
  if (!('detail' in data)) {
    return data.error.message;
  }

  const { detail } = data;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map(issue =>
        issue.loc != null && issue.loc.length > 0
          ? `${issue.loc.join('.')}: ${issue.msg}`
          : issue.msg,
      )
      .join('; ');
  }

  return detail.code != null
    ? `${detail.message} (${detail.code})`
    : detail.message;
}

export const elevenlabsFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: elevenlabsErrorDataSchema,
  errorToMessage: elevenlabsErrorToMessage,
});
