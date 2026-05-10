import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const openResponsesLanguageModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Controls reasoning summary output from the model.
       * Valid values: 'concise', 'detailed', 'auto'.
       */
      reasoningSummary: z.enum(['concise', 'detailed', 'auto']).nullish(),

      /**
       * Forward unsupported non-image file media types as `input_file` parts
       * instead of dropping them in the SDK conversion layer.
       *
       * Defaults to `false`, preserving the existing image-only behavior.
       */
      passThroughUnsupportedFiles: z.boolean().nullish(),
    }),
  ),
);

export type OpenResponsesLanguageModelOptions = InferSchema<
  typeof openResponsesLanguageModelOptions
>;
