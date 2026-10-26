import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';

export const elevenlabsErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        code: z.number(),
      }),
    }),
  ),
);

export type ElevenLabsErrorData = InferSchema<typeof elevenlabsErrorDataSchema>;

export const elevenlabsFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: elevenlabsErrorDataSchema,
  errorToMessage: data => data.error.message,
});
