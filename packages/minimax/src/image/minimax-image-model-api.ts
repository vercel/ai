import { z } from 'zod/v4';
import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';

export const minimaxImageModelResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z.union([
        z.object({ image_urls: z.array(z.string()) }),
        z.object({ image_base64: z.array(z.string()) }),
      ]),
      metadata: z.object({
        success_count: z.number().int(),
        failed_count: z.number().int(),
      }),
      id: z.string(),
      base_resp: z.object({
        status_msg: z.string(),
        status_code: z.number().int(),
      }),
    }),
  ),
);

export type MinimaxImageModelResponse = InferSchema<
  typeof minimaxImageModelResponseSchema
>;
