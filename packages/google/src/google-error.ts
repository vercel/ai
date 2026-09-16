import {
  createJsonErrorResponseHandler,
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

const googleErrorDataSchema = /* @__PURE__ */ lazySchema(() =>
  zodSchema(
    z.object({
      error: z.object({
        code: z.number().nullable(),
        message: z.string(),
        status: z.string(),
        details: z.array(z.unknown()).nullish(),
      }),
    }),
  ),
);

export type GoogleErrorData = InferSchema<typeof googleErrorDataSchema>;

export const googleFailedResponseHandler =
  /* @__PURE__ */ createJsonErrorResponseHandler({
    errorSchema: googleErrorDataSchema,
    errorToMessage: data => data.error.message,
  });
