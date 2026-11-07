import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';

export const humeErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        code: z.number(),
      }),
    }),
  ),
);

export type HumeErrorData = InferSchema<typeof humeErrorDataSchema>;

export const humeFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: humeErrorDataSchema,
  errorToMessage: data => data.error.message,
});
