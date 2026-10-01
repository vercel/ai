import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Fish Audio returns `{ status, message }` for documented error responses
// (401 no permission, 402 no payment).
// https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech
export const fishAudioErrorDataSchema = z.object({
  status: z.number().nullish(),
  message: z.string().nullish(),
});

export type FishAudioErrorData = z.infer<typeof fishAudioErrorDataSchema>;

export const fishAudioFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: fishAudioErrorDataSchema,
  errorToMessage: data => data.message ?? 'Unknown Fish Audio error',
});
