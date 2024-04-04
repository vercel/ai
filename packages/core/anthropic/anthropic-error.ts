import { z } from 'zod';
import { createJsonErrorResponseHandler } from '../spec';

const anthropicErrorDataSchema = z.object({
  type: z.literal('error'),
  error: z.object({
    type: z.string(),
    message: z.string(),
  }),
});

export type AnthropicErrorData = z.infer<typeof anthropicErrorDataSchema>;

export const anthropicFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: anthropicErrorDataSchema,
  errorToMessage: data => data.error.message,
});
