import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const groqErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string().nullish(),
  }),
});

export type GroqErrorData = z.infer<typeof groqErrorDataSchema>;

export const groqFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: groqErrorDataSchema,
  errorToMessage: data => data.error.message,
  failureReason: (_response, data) =>
    data.error.code === 'context_length_exceeded' ||
    data.error.type === 'context_length_exceeded'
      ? 'context-length-exceeded'
      : undefined,
});
