import { z } from 'zod';
import {
  createJsonErrorResponseHandler,
  zodSchema,
} from '../../ai-model-specification';

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
  errorSchema: zodSchema(openAIErrorDataSchema),
  errorToMessage: data => data.error.message,
  isRetryable: (response, error) =>
    response.status >= 500 ||
    (response.status === 429 &&
      // insufficient_quota is also reported as a 429, but it's not retryable:
      error?.error.type !== 'insufficient_quota'),
});
