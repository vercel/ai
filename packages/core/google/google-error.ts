import { z } from 'zod';
import { createJsonErrorResponseHandler } from '../spec';

const googleErrorDataSchema = z.object({
  error: z.object({
    code: z.number().nullable(),
    message: z.string(),
    status: z.string(),
  }),
});

export type GoogleErrorData = z.infer<typeof googleErrorDataSchema>;

export const googleFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: googleErrorDataSchema,
  errorToMessage: data => data.error.message,
});
