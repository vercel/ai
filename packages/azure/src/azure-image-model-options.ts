import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const azureImageModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * API to use. Defaults to MAI for MAI-Image models, OpenAI otherwise.
       */
      api: z.enum(['openai', 'mai']).optional(),

      /**
       * Let the model pick the output aspect ratio from the prompt and any
       * reference images. MAI-Image-2.6 models only.
       */
      autoAspectRatio: z.boolean().optional(),

      /**
       * Ground generation in Bing web search results. MAI-Image-2.6 models only.
       */
      webGrounding: z.boolean().optional(),
    }),
  ),
);

export type AzureImageModelOptions = InferSchema<typeof azureImageModelOptions>;

// Lowercase model IDs served by the MAI image API.
const maiImageModels = new Set([
  'mai-image-2.5',
  'mai-image-2.5-flash',
  'mai-image-2.5-pro',
  'mai-image-2.6',
  'mai-image-2.6-flash',
]);

export function isMAIImageModel(modelId: string) {
  return maiImageModels.has(modelId.toLowerCase());
}
