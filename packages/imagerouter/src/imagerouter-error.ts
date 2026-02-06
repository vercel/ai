import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// ImageRouter error schema - OpenAI-compatible format
const imagerouterErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    code: z.string().nullish(),
  }),
});

export const imagerouterFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: imagerouterErrorDataSchema,
  errorToMessage: data => data.error.message,
});
