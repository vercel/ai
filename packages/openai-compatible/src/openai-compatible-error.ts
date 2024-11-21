import { z } from 'zod';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

// TODO(shaper): Reconcile this with openai-error.ts. We derived from `xai`.

export const openaiCompatibleErrorDataSchema = z.object({
  code: z.string(),
  error: z.string(),
});

export type OpenAICompatibleErrorData = z.infer<
  typeof openaiCompatibleErrorDataSchema
>;

export const openaiCompatibleFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: openaiCompatibleErrorDataSchema,
    errorToMessage: data => data.error,
  });
