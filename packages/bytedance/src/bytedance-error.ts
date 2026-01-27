import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const byteDanceErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().nullish(),
    type: z.string().nullish(),
  }),
});

export type ByteDanceErrorData = z.infer<typeof byteDanceErrorDataSchema>;

export const byteDanceFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: byteDanceErrorDataSchema,
  errorToMessage: data => data.error.message,
});
