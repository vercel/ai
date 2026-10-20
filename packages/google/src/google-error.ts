import {
  createJsonErrorResponseHandler,
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const getGoogleErrorSchema = () =>
  z.object({
    code: z.number().nullable(),
    message: z.string(),
    status: z.string(),
    details: z.array(z.unknown()).nullish(),
  });

const googleErrorDataSchema = lazySchema(() =>
  zodSchema(
    z.object({
      error: getGoogleErrorSchema(),
    }),
  ),
);

export type GoogleErrorData = InferSchema<typeof googleErrorDataSchema>;

export const googleFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: googleErrorDataSchema,
  errorToMessage: data => data.error.message,
});
