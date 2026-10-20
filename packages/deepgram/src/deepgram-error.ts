import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';

export const deepgramErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        code: z.number(),
      }),
    }),
  ),
);

export type DeepgramErrorData = InferSchema<typeof deepgramErrorDataSchema>;

export const deepgramFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: deepgramErrorDataSchema,
  errorToMessage: data => data.error.message,
});
