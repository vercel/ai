import { z } from 'zod/v4';

// https://fireworks.ai/models?type=image
export type FireworksImageModelId =
  | 'accounts/fireworks/models/flux-1-dev-fp8'
  | 'accounts/fireworks/models/flux-1-schnell-fp8'
  | 'accounts/fireworks/models/flux-kontext-pro'
  | 'accounts/fireworks/models/flux-kontext-max'
  | 'accounts/fireworks/models/playground-v2-5-1024px-aesthetic'
  | 'accounts/fireworks/models/japanese-stable-diffusion-xl'
  | 'accounts/fireworks/models/playground-v2-1024px-aesthetic'
  | 'accounts/fireworks/models/SSD-1B'
  | 'accounts/fireworks/models/stable-diffusion-xl-1024-v1-0'
  | (string & {});

// https://docs.fireworks.ai/api-reference/post-imagegeneration
export const fireworksImageModelOptions = z.object({
  cfg_scale: z.number().optional(),
  steps: z.number().optional(),
  negative_prompt: z.string().optional(),
  strength: z.number().optional(),
  scheduler: z.string().optional(),
  safety_checker: z.boolean().optional(),
  output_format: z.string().optional(),
  safety_tolerance: z.number().optional(),
});

export type FireworksImageModelOptions = z.infer<
  typeof fireworksImageModelOptions
>;
