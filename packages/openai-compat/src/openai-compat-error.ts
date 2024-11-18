import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const openaiCompatErrorDataSchema = z.object({
  code: z.string(),
  error: z.string(),
});

export type OpenAICompatErrorData = z.infer<typeof openaiCompatErrorDataSchema>;

export const openaiCompatFailedResponseHandler = createJsonErrorResponseHandler(
  {
    errorSchema: openaiCompatErrorDataSchema,
    errorToMessage: data => data.error,
  },
);
