import type { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type BasetenErrorData = z.infer<typeof basetenErrorSchema>;

// Baseten returns two different envelopes. The Model APIs send a bare string
// (`{"error":"please check the model you provided"}`), while dedicated
// deployments pass through their server's OpenAI-shaped object. Parsing only
// the string form left dedicated-deployment errors falling back to the HTTP
// reason phrase — "Not Found", or nothing at all over HTTP/2.
const basetenErrorSchema = z.object({
  error: z.union([
    z.string(),
    z.object({
      message: z.string(),
      object: z.string().nullish(),
      type: z.string().nullish(),
      param: z.any().nullish(),
      code: z.union([z.string(), z.number()]).nullish(),
    }),
  ]),
});

const errorToMessage = (data: BasetenErrorData) =>
  typeof data.error === 'string' ? data.error : data.error.message;

export const basetenErrorStructure: ProviderErrorStructure<BasetenErrorData> = {
  errorSchema: basetenErrorSchema,
  errorToMessage,
};

export const basetenFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: basetenErrorSchema,
  errorToMessage,
});
