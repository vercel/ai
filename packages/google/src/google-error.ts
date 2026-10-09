import {
  createJsonErrorResponseHandler,
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const googleErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        code: z.number().nullable(),
        message: z.string(),
        status: z.string(),
        details: z.array(z.unknown()).nullish(),
      }),
    }),
  ),
);

export type GoogleErrorData = InferSchema<typeof googleErrorDataSchema>;

export const googleFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: googleErrorDataSchema,
  errorToMessage: data => data.error.message,
  // e.g. "The input token count exceeds the maximum number of tokens allowed
  // 1048576."
  isContextLengthExceeded: (_response, data) =>
    /input token count.*exceeds the maximum/i.test(data.error.message),
});
