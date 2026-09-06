import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

// Error shape returned by the Deepgram APIs, e.g.
// {"err_code":"INVALID_QUERY_PARAMETER","err_msg":"Invalid 'model' value of ...","request_id":"..."}
export const deepgramErrorDataSchema = z.object({
  err_code: z.string(),
  err_msg: z.string(),
  request_id: z.string().optional(),
});

export type DeepgramErrorData = z.infer<typeof deepgramErrorDataSchema>;

export const deepgramFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: deepgramErrorDataSchema,
  errorToMessage: data => data.err_msg,
});
