import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const AzureOpenAIErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    param: z.any().nullable(),
    code: z.string().nullable(),
  }),
});

export type OpenAIErrorData = z.infer<typeof AzureOpenAIErrorDataSchema>;

export const openaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: AzureOpenAIErrorDataSchema,
  errorToMessage: data => data.error.message,
});
