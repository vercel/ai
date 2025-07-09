<<<<<<< HEAD
import { z } from 'zod';
=======
import { z } from 'zod/v4';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const deepgramErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
  }),
});

export type DeepgramErrorData = z.infer<typeof deepgramErrorDataSchema>;

export const deepgramFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: deepgramErrorDataSchema,
  errorToMessage: data => data.error.message,
});
