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
       * Provider-native reasoning effort. The value is passed through to the
       * endpoint and takes precedence over the top-level `reasoning` setting.
       */
      reasoningEffort: z.string().nullish(),

      /**
       * Controls reasoning summary output from the model.
       * Valid values: 'concise', 'detailed', 'auto'.
       */
      reasoningSummary: z.enum(['concise', 'detailed', 'auto']).nullish(),
    }),
  ),
);

export type OpenResponsesLanguageModelOptions = InferSchema<
  typeof openResponsesLanguageModelOptions
>;
