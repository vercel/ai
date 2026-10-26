import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';

export const revaiErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        code: z.number(),
      }),
    }),
  ),
);

export type RevaiErrorData = InferSchema<typeof revaiErrorDataSchema>;

export const revaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: revaiErrorDataSchema,
  errorToMessage: data => data.error.message,
});
