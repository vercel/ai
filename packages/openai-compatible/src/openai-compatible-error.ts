import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

// TODO(shaper): Reconcile this with openai-error.ts. We derived from `xai`.

export const openAICompatibleErrorDataSchema = z.object({
  code: z.string(),
  error: z.string(),
});

export type OpenAICompatibleErrorData = z.infer<
  typeof openAICompatibleErrorDataSchema
>;

export const openAICompatibleFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: openAICompatibleErrorDataSchema,
    errorToMessage: data => data.error,
  });
