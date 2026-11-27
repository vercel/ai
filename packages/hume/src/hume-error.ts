import {
  createJsonErrorResponseHandler,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Hume's API gateway answers a 401, a 429, and a 404 for an unserved path or
// method before the request reaches the service, and those bodies have no code.
const humeErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      code: z.string().nullish(),
      message: z.string(),
      param: z.string().nullish(),
      request_id: z.string().nullish(),
    }),
  ),
);

export const humeFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: humeErrorDataSchema,
  errorToMessage: ({ code, message, param }) =>
    `${message}${code != null ? ` (${code})` : ''}${param != null ? ` [${param}]` : ''}`,
});
