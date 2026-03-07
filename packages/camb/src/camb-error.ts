import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const cambErrorDataSchema = z.object({
  detail: z
    .union([
      z.string(),
      z.array(
        z.object({
          type: z.string().nullish(),
          loc: z.array(z.string()).nullish(),
          msg: z.string(),
          input: z.unknown().nullish(),
        }),
      ),
    ])
    .nullish(),
  message: z.string().nullish(),
  payload: z.string().nullish(),
});

export type CambErrorData = z.infer<typeof cambErrorDataSchema>;

export const cambFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: cambErrorDataSchema,
  errorToMessage: data => {
    if (typeof data.detail === 'string') {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail.map(d => d.msg).join('; ');
    }
    if (data.message) {
      return data.payload ? `${data.message}: ${data.payload}` : data.message;
    }
    return 'Unknown error';
  },
});
