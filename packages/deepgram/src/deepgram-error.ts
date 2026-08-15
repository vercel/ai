import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const deepgramErrorDataSchema = z.union([
  // Shape returned by the current APIs, e.g.
  // {"err_code":"INVALID_QUERY_PARAMETER","err_msg":"Invalid 'model' value of ...","request_id":"..."}
  z.object({
    err_code: z.string(),
    err_msg: z.string(),
    request_id: z.string().optional(),
  }),
  // Legacy shape { "error": { "message": "...", "code": 429 } }
  z.object({
    error: z.object({
      message: z.string(),
      code: z.number(),
    }),
  }),
]);

export type DeepgramErrorData = z.infer<typeof deepgramErrorDataSchema>;

export const deepgramFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: deepgramErrorDataSchema,
  errorToMessage: data =>
    'err_msg' in data ? data.err_msg : data.error.message,
});
