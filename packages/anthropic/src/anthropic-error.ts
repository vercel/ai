import {
  createJsonErrorResponseHandler,
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

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

export type AnthropicErrorData = InferSchema<typeof anthropicErrorDataSchema>;

export const anthropicFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: anthropicErrorDataSchema,
  errorToMessage: data => data.error.message,
  // e.g. "prompt is too long: 215000 tokens > 200000 maximum" or
  // "input length and `max_tokens` exceed context limit: 198000 + 8192 > 200000".
  // Amazon Bedrock's Anthropic transport relays Bedrock's "Input is too long for
  // requested model." through this handler.
  isContextLengthExceeded: (_response, data) =>
    /prompt is too long|exceed context limit|input is too long/i.test(
      data.error.message,
    ),
});
