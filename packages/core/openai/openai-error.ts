import { z } from 'zod';
import { createJsonErrorResponseHandler } from '../spec';

const openAIErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    param: z.any().nullable(),
    code: z.string().nullable(),
  }),
});

export type OpenAIErrorData = z.infer<typeof openAIErrorDataSchema>;

export const openaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: openAIErrorDataSchema,
  errorToMessage: data => data.error.message,
});
