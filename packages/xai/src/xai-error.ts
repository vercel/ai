import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const xaiErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
  }),
});

export type XaiErrorData = z.infer<typeof xaiErrorDataSchema>;

export const xaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: xaiErrorDataSchema,
  errorToMessage: data => data.error.message,
});
