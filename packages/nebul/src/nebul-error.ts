import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

const nebulErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),

    // The additional information below is handled loosely to support
    // changes in the error response:
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

export type NebulErrorData = z.infer<typeof nebulErrorDataSchema>;

export const nebulFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: nebulErrorDataSchema,
  errorToMessage: data => data.error.message,
});
