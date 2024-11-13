import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const grokErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
  }),
});

export type GrokErrorData = z.infer<typeof grokErrorDataSchema>;

export const grokFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: grokErrorDataSchema,
  errorToMessage: data => data.error.message,
});
