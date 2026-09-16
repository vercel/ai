import {
  createJsonErrorResponseHandler,
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const anthropicErrorDataSchema = /* @__PURE__ */ lazySchema(() =>
  zodSchema(
    z.object({
      type: z.literal('error'),
      error: z.object({
        type: z.string(),
        message: z.string(),
      }),
    }),
  ),
);

export type AnthropicErrorData = InferSchema<typeof anthropicErrorDataSchema>;

export const anthropicFailedResponseHandler =
  /* @__PURE__ */ createJsonErrorResponseHandler({
    errorSchema: anthropicErrorDataSchema,
    errorToMessage: data => data.error.message,
  });
