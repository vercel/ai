import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { getAzureModelEntry } from './azure-model-catalog';
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

export type AzureImageModelOptions = InferSchema<typeof azureImageModelOptions>;

export function isMAIImageModel(modelId: string) {
  return getAzureModelEntry(modelId)?.requestConfig?.image?.api === 'mai';
}
