import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const klingaiErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      code: z.number(),
      message: z.string(),
    }),
  ),
);

export type KlingAIErrorData = InferSchema<typeof klingaiErrorDataSchema>;

export const klingaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: klingaiErrorDataSchema,
  errorToMessage: data => data.message,
});
