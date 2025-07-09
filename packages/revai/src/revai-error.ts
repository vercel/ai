<<<<<<< HEAD
import { z } from 'zod';
=======
import { z } from 'zod/v4';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const revaiErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
  }),
});

export type RevaiErrorData = z.infer<typeof revaiErrorDataSchema>;

export const revaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: revaiErrorDataSchema,
  errorToMessage: data => data.error.message,
});
