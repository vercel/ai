import {
  createJsonErrorResponseHandler,
  InferValidator,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

export const anthropicErrorDataSchema = lazySchema(() =>
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

export type AnthropicErrorData = InferValidator<
  typeof anthropicErrorDataSchema
>;

export const anthropicFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: anthropicErrorDataSchema,
  errorToMessage: data => data.error.message,
});
