import type { APICallError } from '@ai-sdk/provider';
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
export function getAmazonBedrockErrorReason(
  message: string,
): APICallError['reason'] {
  return /input is too long|prompt is too long/i.test(message)
    ? 'context-length-exceeded'
    : undefined;
}

export const amazonBedrockFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: AmazonBedrockErrorSchema,
    errorToMessage: error =>
      error.type == null ? error.message : `${error.type}: ${error.message}`,
    reason: (_response, error) => getAmazonBedrockErrorReason(error.message),
  });
