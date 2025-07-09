<<<<<<< HEAD
import { z } from 'zod';
=======
import { z } from 'zod/v4';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const humeErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
  }),
});

export type HumeErrorData = z.infer<typeof humeErrorDataSchema>;

export const humeFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: humeErrorDataSchema,
  errorToMessage: data => data.error.message,
});
