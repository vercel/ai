import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const elevenlabsErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
  }),
});

export type ElevenLabsErrorData = z.infer<typeof elevenlabsErrorDataSchema>;

export const elevenlabsFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: elevenlabsErrorDataSchema,
  errorToMessage: data => data.error.message,
});
