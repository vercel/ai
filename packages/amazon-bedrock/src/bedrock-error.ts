import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const BedrockErrorSchema = z.object({
  message: z.string(),
  type: z.string().nullish(),
});

export const amazonBedrockFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: AmazonBedrockErrorSchema,
    errorToMessage: error =>
      error.type == null ? error.message : `${error.type}: ${error.message}`,
  });
