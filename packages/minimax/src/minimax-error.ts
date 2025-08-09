import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

/**
 * https://www.minimax.io/platform/document/error%20code?key=67bdad8b477c38ac523fdb7e
 */

export const minimaxErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.number(),
  }),
});

export type MinimaxErrorData = z.infer<typeof minimaxErrorDataSchema>;

export const minimaxFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: minimaxErrorDataSchema,
  errorToMessage: data => data.error.message,
});
