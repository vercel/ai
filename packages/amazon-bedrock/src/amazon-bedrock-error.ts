import { z } from 'zod/v4';

export const AmazonBedrockErrorSchema = z.object({
  message: z.string(),
  type: z.string().nullish(),
});

export type AmazonBedrockError = z.infer<typeof AmazonBedrockErrorSchema>;

export function amazonBedrockErrorToMessage(error: AmazonBedrockError) {
  return error.type ? `${error.type}: ${error.message}` : error.message;
}
