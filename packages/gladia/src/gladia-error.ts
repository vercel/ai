import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';

export const gladiaErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        code: z.number(),
      }),
    }),
  ),
);

export type GladiaErrorData = InferSchema<typeof gladiaErrorDataSchema>;

export const gladiaFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: gladiaErrorDataSchema,
  errorToMessage: data => data.error.message,
});
