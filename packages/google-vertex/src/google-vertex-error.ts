import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const googleVertexErrorDataSchema = lazySchema(() =>
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

export type GoogleVertexErrorData = InferSchema<
  typeof googleVertexErrorDataSchema
>;

export const googleVertexFailedResponseHandler = createJsonErrorResponseHandler(
  {
    errorSchema: googleVertexErrorDataSchema,
    errorToMessage: data => data.error.message,
  },
);
