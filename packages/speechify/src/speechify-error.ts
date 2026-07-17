import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const speechifyErrorDataSchema = z.object({
  error: z.object({
    code: z.string().nullish(),
    message: z.string(),
  }),
  request_id: z.string().nullish(),
});

export type SpeechifyErrorData = z.infer<typeof speechifyErrorDataSchema>;

export const speechifyFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: speechifyErrorDataSchema,
  errorToMessage: data => data.error.message,
});
