import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const muapiErrorDataSchema = z.object({
  detail: z.string().optional(),
  message: z.string().optional(),
});

export type MuApiErrorData = z.infer<typeof muapiErrorDataSchema>;

export const muapiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: muapiErrorDataSchema,
  errorToMessage: data => data.detail ?? data.message ?? 'Unknown error',
});
