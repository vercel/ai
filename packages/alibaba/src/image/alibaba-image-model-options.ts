import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type AlibabaImageModelId =
  | 'qwen-image-3.0'
  | 'qwen-image-3.0-pro'
  | (string & {});

/**
 * @see https://www.alibabacloud.com/help/en/model-studio/qwen-image-generation-and-editing-api-reference#dashscope-synchronous-api-recommended
 */
export const alibabaImageModelGenerationOptions = lazySchema(() =>
  zodSchema(
    z.object({
      prompt_extend: z.boolean().default(true).optional(),
      prompt_extend_model: z
        .union([z.literal('direct'), z.literal('agent')])
        .default('direct')
        .optional(),
      enable_thinking: z.boolean().default(true).optional(),
      n: z.number().int().min(1).max(6).default(1).optional(),
      size: z.string().optional(),
      negative_prompt: z.string().optional(),
      seed: z.number().min(0).max(2147483647).optional(),
      watermark: z.boolean().default(false).optional(),
    }),
  ),
);

export type AlibabaImageModelOptions = InferSchema<
  typeof alibabaImageModelGenerationOptions
>;
