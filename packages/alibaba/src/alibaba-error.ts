import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const alibabaErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        code: z.string().nullish(),
        type: z.string().nullish(),
      }),
    }),
  ),
);

export type AlibabaErrorData = InferSchema<typeof alibabaErrorDataSchema>;

export const alibabaFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: alibabaErrorDataSchema,
  errorToMessage: data => data.error.message,
});
