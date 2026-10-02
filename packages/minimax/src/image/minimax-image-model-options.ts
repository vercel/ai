import type { InferSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type MinimaxImageModelID = 'image-01' | (string & {});

export const minimaxImageModelProviderOptions = z.object({
  subject_reference: z
    .object({
      type: z.string(),
      image_file: z.string(),
    })
    .optional(),
  aspect_ratio: z
    .union([
      z.literal('1:1'),
      z.literal('16:9'),
      z.literal('4:3'),
      z.literal('3:2'),
      z.literal('2:3'),
      z.literal('3:4'),
      z.literal('9:16'),
      z.literal('21:9'),
    ])
    .default('1:1')
    .optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  response_format: z
    .union([z.literal('url'), z.literal('base64')])
    .default('url')
    .optional(),
  seed: z.number().optional(),
  n: z.number().int().min(1).max(0).default(1).optional(),
  prompt_optimizer: z.boolean().default(false).optional(),
});

export type MinimaxImageModelProviderOptions = InferSchema<
  typeof minimaxImageModelProviderOptions
>;
