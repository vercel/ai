import { z } from 'zod';

export const BedrockErrorSchema = z.object({
  message: z.string(),
  type: z.string(),
});
