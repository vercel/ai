import { z } from 'zod';

export const modelTypeSchema = z.enum(['language', 'embedding', 'image']);

export const modelDefinitionSchema = z.object({
  provider: z.string(),
  modelType: modelTypeSchema,
  modelId: z.string(),
  variant: z.string().optional(),
  expectedCapabilities: z.array(z.string()),
});

export const capabilitiesSchema = z.object({
  models: z.array(modelDefinitionSchema),
});

export type ModelType = z.infer<typeof modelTypeSchema>;
export type ModelDefinition = z.infer<typeof modelDefinitionSchema>;
