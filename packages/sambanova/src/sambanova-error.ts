import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const sambanovaErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
  }),
});

export type SambaNovaErrorData = z.infer<typeof sambanovaErrorDataSchema>;

export const sambanovaFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: sambanovaErrorDataSchema,
  errorToMessage: data => data.error.message,
});
