import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const cambaiErrorDataSchema = z.object({
  detail: z.union([
    z.string(),
    z.array(
      z.object({
        loc: z.array(z.union([z.string(), z.number()])),
        msg: z.string(),
        type: z.string(),
      }),
    ),
  ]),
});

export type CambaiErrorData = z.infer<typeof cambaiErrorDataSchema>;

export const cambaiFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: cambaiErrorDataSchema,
  errorToMessage: data =>
    typeof data.detail === 'string'
      ? data.detail
      : data.detail.map(d => d.msg).join(', '),
});
