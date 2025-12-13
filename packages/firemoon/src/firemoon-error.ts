import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const firemoonErrorSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  errors: z.array(z.string()).optional(),
});

export const firemoonFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: firemoonErrorSchema,
  errorToMessage: error => {
    if (error.message) {
      return error.message;
    }
    if (error.errors && error.errors.length > 0) {
      return error.errors.join(', ');
    }
    if (error.error) {
      return error.error;
    }
    return 'Unknown Firemoon error';
  },
});
