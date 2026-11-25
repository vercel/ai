import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const mistralErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      object: z.literal('error'),
      message: z.string(),
      type: z.string(),
      param: z.string().nullable(),
      code: z.string().nullable(),
    }),
  ),
);

export type MistralErrorData = InferSchema<typeof mistralErrorDataSchema>;

export const mistralFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: mistralErrorDataSchema,
  errorToMessage: data => data.message,
});
