import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod';

const inflectionErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.string().nullable(),
  }),
});

export type InflectionErrorData = z.infer<typeof inflectionErrorDataSchema>;

export const inflectionFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: inflectionErrorDataSchema,
  errorToMessage: data => data.error.message,
});
