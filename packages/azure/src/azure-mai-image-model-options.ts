import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const azureMaiImageModelOptionsShape = () => ({
  /**
   * Let the model pick the output aspect ratio from the prompt and any
   * reference images. MAI-Image-2.6 models only.
   */
  autoAspectRatio: z.boolean().optional(),

  /**
   * Ground generation in Bing web search results. MAI-Image-2.6 models only.
   */
  webGrounding: z.boolean().optional(),
});

export const azureMaiImageModelOptions = lazySchema(() =>
  zodSchema(z.object(azureMaiImageModelOptionsShape())),
);

export type AzureImageModelMaiOptions = InferSchema<
  typeof azureMaiImageModelOptions
>;
