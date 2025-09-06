import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const modelsLabErrorDataSchema = z.object({
  status: z.literal('error'),
  message: z.string(),
});

export type ModelsLabErrorData = z.infer<typeof modelsLabErrorDataSchema>;

export const modelsLabFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: modelsLabErrorDataSchema,
  errorToMessage: data => data.message,
});
