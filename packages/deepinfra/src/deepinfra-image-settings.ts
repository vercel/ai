import { z } from 'zod/v4';

// https://deepinfra.com/models/text-to-image
export type DeepInfraImageModelId =
  | 'stabilityai/sd3.5'
  | 'black-forest-labs/FLUX-1.1-pro'
  | 'black-forest-labs/FLUX-1-schnell'
  | 'black-forest-labs/FLUX-1-dev'
  | 'black-forest-labs/FLUX-pro'
  | 'black-forest-labs/FLUX.1-Kontext-dev'
  | 'black-forest-labs/FLUX.1-Kontext-pro'
  | 'stabilityai/sd3.5-medium'
  | 'stabilityai/sdxl-turbo'
  | (string & {});

// https://deepinfra.com/docs/deep-infra-api/openapi
export const deepInfraImageModelOptions = z.object({
  guidance_scale: z.number().optional(),
  num_inference_steps: z.number().optional(),
  negative_prompt: z.string().optional(),
  strength: z.number().optional(),
  scheduler: z.string().optional(),
  image_format: z.string().optional(),
  response_format: z.string().optional(),
});

export type DeepInfraImageModelOptions = z.infer<
  typeof deepInfraImageModelOptions
>;
