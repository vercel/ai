import { z } from 'zod/v4';

export type BedrockImageModelId = 'amazon.nova-canvas-v1:0' | (string & {});

// https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
export const modelMaxImagesPerCall: Record<BedrockImageModelId, number> = {
  'amazon.nova-canvas-v1:0': 5,
};

// https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
export const amazonBedrockImageModelOptions = z.object({
  quality: z.string().optional(),
  cfgScale: z.number().optional(),
  negativeText: z.string().optional(),
  style: z.string().optional(),
  taskType: z.string().optional(),
  maskPrompt: z.string().optional(),
  outPaintingMode: z.enum(['DEFAULT', 'PRECISE']).optional(),
  similarityStrength: z.number().optional(),
});

export type AmazonBedrockImageModelOptions = z.infer<
  typeof amazonBedrockImageModelOptions
>;
