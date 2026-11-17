import {
  createJsonErrorResponseHandler,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const liquidErrorSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        message: z.string(),
        code: z.string().nullish(),
      }),
    }),
  ),
);

export const liquidFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: liquidErrorSchema,
  errorToMessage: ({ error }) =>
    `${error.message}${error.code != null ? ` (${error.code})` : ''}`,
});
