import { z } from 'zod/v4';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

// The co-op gateway (LiteLLM) reports failures in the standard OpenAI error
// envelope. Fields beyond `message` are handled loosely to tolerate gateway
// changes, mirroring the default OpenAI-compatible error structure.
export const inferenceCoopErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

export type InferenceCoopErrorData = z.infer<
  typeof inferenceCoopErrorDataSchema
>;

export const inferenceCoopFailedResponseHandler =
  createJsonErrorResponseHandler({
    errorSchema: inferenceCoopErrorDataSchema,
    errorToMessage: data => data.error.message,
  });
