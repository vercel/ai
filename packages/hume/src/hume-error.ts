import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const humeErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
  }),
});

export type HumeErrorData = z.infer<typeof humeErrorDataSchema>;

export const humeFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: humeErrorDataSchema,
  errorToMessage: data => data.error.message,
});
