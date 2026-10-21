import {
  lazySchema,
  zodSchema,
  type InferSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const cohereErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      message: z.string(),
    }),
  ),
);

export type CohereErrorData = InferSchema<typeof cohereErrorDataSchema>;

export const cohereFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: cohereErrorDataSchema,
  errorToMessage: data => data.message,
});
