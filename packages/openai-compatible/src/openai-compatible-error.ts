import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const OpenAICompatibleErrorDataSchema = z.object({
  code: z.string(),
  error: z.string(),
});

export type OpenAICompatibleErrorData = z.infer<
  typeof OpenAICompatibleErrorDataSchema
>;

export const OpenAICompatibleFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: OpenAICompatibleErrorDataSchema,
    errorToMessage: data => data.error,
  });
