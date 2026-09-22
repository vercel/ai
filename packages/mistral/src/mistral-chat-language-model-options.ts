import { z } from 'zod/v4';

// https://docs.mistral.ai/models
export type MistralChatModelId =
  | 'codestral-2508'
  | 'codestral-latest'
  | 'glm-5-2'
  | 'labs-leanstral-1-5'
  | 'labs-leanstral-1-5-1'
  | 'magistral-medium-latest'
  | 'magistral-small-latest'
  | 'ministral-14b-2512'
  | 'ministral-14b-latest'
  | 'ministral-3b-2512'
  | 'ministral-3b-latest'
  | 'ministral-8b-2512'
  | 'ministral-8b-latest'
  | 'mistral-code-fim-latest'
  | 'mistral-code-latest'
  | 'mistral-large-latest'
  | 'mistral-large-2512'
  | 'mistral-medium'
  | 'mistral-medium-latest'
  | 'mistral-medium-2604'
  | 'mistral-medium-3'
  | 'mistral-medium-3-5'
  | 'mistral-medium-3.5'
  | 'mistral-small-2603'
  | 'mistral-small-latest'
  | 'mistral-vibe-cli-fast'
  | 'mistral-vibe-cli-latest'
  | 'mistral-vibe-cli-with-tools'
  | 'voxtral-small-2507'
  | 'voxtral-small-latest'
  | 'zai-glm-5-2'
  | (string & {});

export const mistralLanguageModelChatOptions = z.object({
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
   */
  reasoningEffort: z.enum(['high', 'none']).optional(),
});

export type MistralLanguageModelChatOptions = z.infer<
  typeof mistralLanguageModelChatOptions
>;
