import { z } from 'zod/v4';

export const exampleMetadataSchema = z.object({
  createdAt: z.number().optional(),
  duration: z.number().optional(),
  model: z.string().optional(),
  totalTokens: z.number().optional(),
  finishReason: z.string().optional(),
});

export type ExampleMetadata = z.infer<typeof exampleMetadataSchema>;
