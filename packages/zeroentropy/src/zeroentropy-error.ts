import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const zeroEntropyErrorDataSchema = z.object({
  // detail is a plain string for most errors, but FastAPI returns an array of
  // validation error objects for 422 responses.
  detail: z.union([
    z.string(),
    z.array(z.object({ msg: z.string() }).passthrough()),
  ]),
});

export type ZeroEntropyErrorData = z.infer<typeof zeroEntropyErrorDataSchema>;

export const zeroEntropyFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: zeroEntropyErrorDataSchema,
  errorToMessage: data =>
    typeof data.detail === 'string'
      ? data.detail
      : data.detail.map(e => e.msg).join(', '),
});
