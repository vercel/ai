import { z } from 'zod';

// Add error schema and structure
export const xaiErrorSchema = z.object({
  code: z.string(),
  error: z.string(),
});

export type XaiErrorData = z.infer<typeof xaiErrorSchema>;
