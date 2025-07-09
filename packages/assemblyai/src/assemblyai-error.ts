<<<<<<< HEAD
import { z } from 'zod';
=======
import { z } from 'zod/v4';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const assemblyaiErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
  }),
});

export type AssemblyAIErrorData = z.infer<typeof assemblyaiErrorDataSchema>;

export const assemblyaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: assemblyaiErrorDataSchema,
  errorToMessage: data => data.error.message,
});
