import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const alibabaImageGenerationResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      request_id: z.string(),
      output: z.object({
        rewrite_status: z.string().nullish(),
        choices: z.array(
          z.object({
            finish_reason: z.string().nullish(),
            message: z.object({
              role: z.string(),
              content: z.array(
                z.object({
                  image: z.string(),
                }),
              ),
            }),
          }),
        ),
      }),
      usage: z.object({
        output_width: z.number(),
        output_height: z.number(),
        input_image_count: z.number(),
        input_image_type: z.string(),
        output_image_count: z.number(),
        output_image_type: z.string(),
      }),
    }),
  ),
);

export const alibabaImageGenerationErrorResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      request_id: z.string(),
      code: z.string(),
      message: z.string(),
    }),
  ),
);
