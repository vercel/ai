import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const herokuErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.string().optional(),
  }),
});

export type HerokuErrorData = z.infer<typeof herokuErrorDataSchema>;

export const herokuFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: herokuErrorDataSchema,
  errorToMessage: data => data.error.message,
});
