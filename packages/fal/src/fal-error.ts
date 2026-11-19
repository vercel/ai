import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';

export const falErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        code: z.number(),
      }),
    }),
  ),
);

export type FalErrorData = InferSchema<typeof falErrorDataSchema>;

export const falFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: falErrorDataSchema,
  errorToMessage: data => data.error.message,
});
