import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const veniceErrorDataSchema = z.object({
  error: z.string(),
});

export type VeniceAIErrorData = z.infer<typeof veniceErrorDataSchema>;

export const veniceFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: veniceErrorDataSchema,
  errorToMessage: data => data.error,
});
