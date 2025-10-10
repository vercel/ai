import {
  createJsonErrorResponseHandler,
  type InferValidator,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

const googleErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        code: z.number().nullable(),
        message: z.string(),
        status: z.string(),
      }),
    }),
  ),
);

export type GoogleErrorData = InferValidator<typeof googleErrorDataSchema>;

export const googleFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: googleErrorDataSchema,
  errorToMessage: data => data.error.message,
});
