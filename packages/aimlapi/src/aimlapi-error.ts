import { z } from 'zod';

// Add error schema and structure
export const aimlapiErrorSchema = z.object({
  code: z.string(),
  error: z.string(),
});

export type AIMLAPIErrorData = z.infer<typeof aimlapiErrorSchema>;
