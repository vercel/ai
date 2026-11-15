import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { CohereModelIds } from './cohere-model-catalog';

// https://docs.cohere.com/docs/models
export type CohereChatModelId = CohereModelIds['language'] | (string & {});

export const cohereLanguageModelChatOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Configuration for reasoning features (optional)
       *
       * Can be set to an object with the two properties `type` and `tokenBudget`. `type` can be set to `'enabled'` or `'disabled'` (defaults to `'enabled'`).
       * `tokenBudget` is the maximum number of tokens the model can use for thinking, which must be set to a positive integer. The model will stop thinking if it reaches the thinking token budget and will proceed with the response
       *
       * @see https://docs.cohere.com/reference/chat#request.body.thinking
       */
      thinking: z
        .object({
          type: z.enum(['enabled', 'disabled']).optional(),
          tokenBudget: z.number().optional(),
        })
        .optional(),
    }),
  ),
);

export type CohereLanguageModelChatOptions = InferSchema<
  typeof cohereLanguageModelChatOptions
>;

export const cohereImagePartProviderOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Image fidelity level passed through as `image_url.detail` on the Cohere chat API.
       *
       * @see https://docs.cohere.com/docs/image-inputs
       */
      detail: z.enum(['auto', 'low', 'high']).optional(),
    }),
  ),
);

export type CohereImagePartProviderOptions = InferSchema<
  typeof cohereImagePartProviderOptions
>;
