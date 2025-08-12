import { z } from 'zod/v4';

// https://platform.openai.com/docs/models
export type OpenAIChatModelId =
  | 'o1'
  | 'o1-2024-12-17'
  | 'o3-mini'
  | 'o3-mini-2025-01-31'
  | 'o3'
  | 'o3-2025-04-16'
  | 'gpt-4.1'
  | 'gpt-4.1-2025-04-14'
  | 'gpt-4.1-mini'
  | 'gpt-4.1-mini-2025-04-14'
  | 'gpt-4.1-nano'
  | 'gpt-4.1-nano-2025-04-14'
  | 'gpt-4o'
  | 'gpt-4o-2024-05-13'
  | 'gpt-4o-2024-08-06'
  | 'gpt-4o-2024-11-20'
  | 'gpt-4o-mini'
  | 'gpt-4o-mini-2024-07-18'
  | 'gpt-4-turbo'
  | 'gpt-4-turbo-2024-04-09'
  | 'gpt-4'
  | 'gpt-4-0613'
  | 'gpt-4.5-preview'
  | 'gpt-4.5-preview-2025-02-27'
  | 'gpt-3.5-turbo-0125'
  | 'gpt-3.5-turbo'
  | 'gpt-3.5-turbo-1106'
  | 'chatgpt-4o-latest'
  | 'gpt-5'
  | 'gpt-5-2025-08-07'
  | 'gpt-5-mini'
  | 'gpt-5-mini-2025-08-07'
  | 'gpt-5-nano'
  | 'gpt-5-nano-2025-08-07'
  | 'gpt-5-chat-latest'
  | (string & {});

export const openaiProviderOptions = z.object({
  /**
   * Modify the likelihood of specified tokens appearing in the completion.
   *
   * Accepts a JSON object that maps tokens (specified by their token ID in
   * the GPT tokenizer) to an associated bias value from -100 to 100.
   */
  logitBias: z.record(z.coerce.number<string>(), z.number()).optional(),

  /**
   * Return the log probabilities of the tokens.
   *
   * Setting to true will return the log probabilities of the tokens that
   * were generated.
   *
   * Setting to a number will return the log probabilities of the top n
   * tokens that were generated.
   */
  logprobs: z.union([z.boolean(), z.number()]).optional(),

  /**
   * Whether to enable parallel function calling during tool use. Default to true.
   */
  parallelToolCalls: z.boolean().optional(),

  /**
   * A unique identifier representing your end-user, which can help OpenAI to
   * monitor and detect abuse.
   */
  user: z.string().optional(),

  /**
   * Reasoning effort for reasoning models. Defaults to `medium`.
   */
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),

  /**
   * Maximum number of completion tokens to generate. Useful for reasoning models.
   */
  maxCompletionTokens: z.number().optional(),

  /**
   * Whether to enable persistence in responses API.
   */
  store: z.boolean().optional(),

  /**
   * Metadata to associate with the request.
   */
  metadata: z.record(z.string().max(64), z.string().max(512)).optional(),

  /**
   * Parameters for prediction mode.
   */
  prediction: z.record(z.string(), z.any()).optional(),

  /**
   * Whether to use structured outputs.
   *
   * @default true
   */
  structuredOutputs: z.boolean().optional(),

  /**
   * Service tier for the request.
   * - 'auto': Default service tier
   * - 'flex': 50% cheaper processing at the cost of increased latency. Only available for o3 and o4-mini models.
   * - 'priority': Higher-speed processing with predictably low latency at premium cost. Available for Enterprise customers.
   *
   * @default 'auto'
   */
  serviceTier: z.enum(['auto', 'flex', 'priority']).optional(),

  /**
   * Whether to use strict JSON schema validation.
   *
   * @default false
   */
  strictJsonSchema: z.boolean().optional(),

  /**
   * Controls the verbosity of the model's responses.
   * Lower values will result in more concise responses, while higher values will result in more verbose responses.
   */
  textVerbosity: z.enum(['low', 'medium', 'high']).optional(),

  /**
   * A cache key for prompt caching. Allows manual control over prompt caching behavior.
   * Useful for improving cache hit rates and working around automatic caching issues.
   */
  promptCacheKey: z.string().optional(),
});

export type OpenAIProviderOptions = z.infer<typeof openaiProviderOptions>;
