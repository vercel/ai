import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const heygenFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: z.object({
    error: z.object({
      code: z.string().nullish(),
      message: z.string(),
      param: z.string().nullish(),
    }),
  }),
  errorToMessage: ({ error }) =>
    `${error.message}${error.code != null ? ` (${error.code})` : ''}${error.param != null ? ` [${error.param}]` : ''}`,
});
