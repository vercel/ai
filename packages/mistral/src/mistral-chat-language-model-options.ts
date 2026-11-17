import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { MistralModelIds } from './mistral-model-catalog';

// https://docs.mistral.ai/models
export type MistralChatModelId = MistralModelIds['language'] | (string & {});

export const mistralLanguageModelChatOptions = () =>
  z.object({
    /**
     * Whether to inject a safety prompt before all conversations.
     *
     * Defaults to `false`.
     */
    safePrompt: z.boolean().optional(),

    documentImageLimit: z.number().optional(),
    documentPageLimit: z.number().optional(),

    /**
     * Whether to use structured outputs.
     *
     * @default true
     */
    structuredOutputs: z.boolean().optional(),

    /**
     * Whether to use strict JSON schema validation.
     *
     * @default false
     */
    strictJsonSchema: z.boolean().optional(),

    /**
     * Whether to enable parallel function calling during tool use.
     * When set to false, the model will use at most one tool per response.
     *
     * @default true
     */
    parallelToolCalls: z.boolean().optional(),

    /**
     * A stable identifier used to route requests with shared prompt prefixes to
     * the same cache.
     */
    promptCacheKey: z.string().optional(),

    /**
     * Controls the reasoning effort for models that support adjustable reasoning.
     *
     * - `'high'`: Enable reasoning
     * - `'none'`: Disable reasoning
     * - `'medium'`: Medium reasoning effort for models that support it, e.g.
     *   `mistral-large-4`, which accepts `'low'`, `'medium'`, and `'high'`
     * - `'low'`, `'max'`: Lowest and highest reasoning effort for models that
     *   support them, e.g. `zai-glm-5-3`, which accepts `'low'`, `'high'`, and
     *   `'max'` but not `'none'`
     */
    reasoningEffort: z
      .enum(['high', 'none', 'low', 'medium', 'max'])
      .optional(),
  });
export const mistralLanguageModelChatOptionsValidator = lazySchema(() =>
  zodSchema(mistralLanguageModelChatOptions()),
);

export type MistralLanguageModelChatOptions = z.infer<
  ReturnType<typeof mistralLanguageModelChatOptions>
>;
