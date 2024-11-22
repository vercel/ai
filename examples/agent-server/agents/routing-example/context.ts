import { z } from 'zod';

export const bodySchema = z.object({
  prompt: z.string(),
});

export const contextSchema = z.object({
  prompt: z.string(),
  selectedRoute: z.string().nullable(),
});

export type Context = z.infer<typeof contextSchema>;
