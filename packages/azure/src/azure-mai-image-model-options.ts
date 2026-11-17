import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const azureMaiImageModelOptionsShape = () => ({
  /**
   * Let the model pick the output aspect ratio from the prompt and any
   * reference images. MAI-Image-2.6 and MAI-Image-2.7 models only.
   */
  autoAspectRatio: z.boolean().optional(),

  /**
   * Ground generation in Bing web search results. MAI-Image-2.6 and
   * MAI-Image-2.7 models only.
   */
  webGrounding: z.boolean().optional(),
});

// Parsed only on the MAI route. `auto` (an OpenAI value) is accepted so the
// MAI model can drop it with a warning.
const maiBackgroundShape = () => ({
  background: z.enum(['transparent', 'opaque', 'auto']).optional(),
});

export const azureMaiImageBackgroundOptions = lazySchema(() =>
  zodSchema(z.object(maiBackgroundShape())),
);

export const azureMaiImageModelOptions = lazySchema(() =>
  zodSchema(
    z.object({ ...azureMaiImageModelOptionsShape(), ...maiBackgroundShape() }),
  ),
);

export type AzureImageModelMaiOptions = InferSchema<
  typeof azureMaiImageModelOptions
>;
