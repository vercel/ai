import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const AmazonBedrockErrorSchema = z.object({
  message: z.string(),
  type: z.string().nullish(),
});

export const amazonBedrockFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: AmazonBedrockErrorSchema,
    errorToMessage: error =>
      error.type == null ? error.message : `${error.type}: ${error.message}`,
  });
