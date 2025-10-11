import { z } from 'zod/v4';

export const BedrockErrorSchema = z.object({
  message: z.string(),
  type: z.string().nullish(),
});
