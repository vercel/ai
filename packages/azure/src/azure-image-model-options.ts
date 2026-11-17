import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { azureMaiImageModelOptionsShape } from './azure-mai-image-model-options';

export const azureImageModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * API to use. Defaults to MAI for MAI-Image models, OpenAI otherwise.
       */
      api: z.enum(['openai', 'mai']).optional(),
      ...azureMaiImageModelOptionsShape(),
    }),
  ),
);

export type AzureImageModelOptions = InferSchema<
  typeof azureImageModelOptions
> & {
  /**
   * Output background. `transparent` returns a PNG with an alpha channel.
   * Defaults to `opaque`. MAI-Image-2.7 models only; ignored on the OpenAI API.
   */
  background?: 'transparent' | 'opaque';
};

// Lowercase model IDs served by the MAI image API.
const maiImageModels = new Set([
  'mai-image-2.5',
  'mai-image-2.5-flash',
  'mai-image-2.5-pro',
  'mai-image-2.6',
  'mai-image-2.6-flash',
  'mai-image-2.7',
  'mai-image-2.7-flash',
]);

export function isMAIImageModel(modelId: string) {
  return maiImageModels.has(modelId.toLowerCase());
}
