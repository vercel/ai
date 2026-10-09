import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const AmazonBedrockErrorSchema = z.object({
  message: z.string(),
  type: z.string().nullish(),
});

/**
 * Converse: "Input is too long for requested model."; Anthropic models:
 * "prompt is too long: 215000 tokens > 200000 maximum".
 */
export function isAmazonBedrockContextLengthExceeded(
  _response: Response,
  error: { message: string },
): boolean {
  return /input is too long|prompt is too long/i.test(error.message);
}

export const amazonBedrockFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: AmazonBedrockErrorSchema,
    errorToMessage: error =>
      error.type == null ? error.message : `${error.type}: ${error.message}`,
    isContextLengthExceeded: isAmazonBedrockContextLengthExceeded,
  });
