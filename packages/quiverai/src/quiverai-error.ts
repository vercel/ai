import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const quiveraiErrorSchema = z.object({
  status: z.number().int(),
  code: z.string().min(1),
  message: z.string().min(1),
  request_id: z.string().min(1),
});

export const quiveraiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: quiveraiErrorSchema,
  errorToMessage: error => error.message,
  isRetryable: response => response.status === 429 || response.status >= 500,
});
