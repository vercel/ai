import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const falErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
  }),
});

export type FalErrorData = z.infer<typeof falErrorDataSchema>;

export const falFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: falErrorDataSchema,
  errorToMessage: data => data.error.message,
});
