import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const SarvamErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
  }),
});

export type SarvamErrorData = z.infer<typeof SarvamErrorDataSchema>;

export const sarvamFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: SarvamErrorDataSchema,
  errorToMessage: data => data.error.message,
});
