import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod';

const cohereErrorDataSchema = z.object({
  message: z.string(),
});

export type CohereErrorData = z.infer<typeof cohereErrorDataSchema>;

export const cohereFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: cohereErrorDataSchema,
  errorToMessage: data => data.message,
});
