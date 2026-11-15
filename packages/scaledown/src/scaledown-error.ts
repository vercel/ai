import {
  createJsonErrorResponseHandler,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

const scaledownErrorSchema = lazySchema(() =>
  zodSchema(
    z.object({
      detail: z.union([z.string(), z.array(z.object({ msg: z.string() }))]),
    }),
  ),
);

export const scaledownFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: scaledownErrorSchema,
  errorToMessage: error =>
    typeof error.detail === 'string'
      ? error.detail
      : error.detail.map(detail => detail.msg).join(', '),
});
