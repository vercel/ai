import { z } from 'zod';

export const contextSchema = z.object({
  prompt: z.string(),
});

export type Context = z.infer<typeof contextSchema>;
