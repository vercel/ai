import { z } from 'zod';
import { ProviderErrorStructure } from '@ai-sdk/openai-compatible';
import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';

export const friendliaiErrorSchema = z.object({
  message: z.string(),

  // Not really needed, but required for schema format
  error: z.object({}),
});

export type FriendliAIErrorData = z.infer<typeof friendliaiErrorSchema>;

export const friendliaiErrorStructure: ProviderErrorStructure<FriendliAIErrorData> =
  {
    errorSchema: friendliaiErrorSchema,
    errorToMessage: data => data.message,
  };

export const friendliaiFailedResponseHandler = createJsonErrorResponseHandler(
  friendliaiErrorStructure,
);
