import {
  lazySchema,
  zodSchema,
  createJsonErrorResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const BedrockErrorSchema = lazySchema(() =>
  zodSchema(
    z.object({
      message: z.string(),
      type: z.string().nullish(),
    }),
  ),
);

export const bedrockFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: BedrockErrorSchema,
  errorToMessage: error =>
    error.type == null ? error.message : `${error.type}: ${error.message}`,
});
