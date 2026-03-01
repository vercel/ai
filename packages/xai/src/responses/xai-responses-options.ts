import { z } from 'zod/v4';

export type XaiResponsesModelId =
  | 'grok-4-1-fast-reasoning'
  | 'grok-4-1-fast-non-reasoning'
  | 'grok-4'
  | 'grok-4-fast'
  | 'grok-4-fast-non-reasoning'
  | (string & {});

/**
 * @see https://docs.x.ai/docs/api-reference#create-new-response
 */
export const xaiLanguageModelResponsesOptions = z.object({
  /**
   * Constrains how hard a reasoning model thinks before responding.
   * Possible values are `low` (uses fewer reasoning tokens), `medium` and `high` (uses more reasoning tokens).
   */
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  /**
   * Whether to store the input message(s) and model response for later retrieval.
   * @default true
   */
  store: z.boolean().optional(),
  /**
   * The ID of the previous response from the model.
   */
  previousResponseId: z.string().optional(),
  /**
   * Specify additional output data to include in the model response.
   * Example values: 'file_search_call.results'.
   */
  include: z.array(z.enum(['file_search_call.results'])).nullish(),
  /**
   * Whether to enable parallel tool calling during tool use.
   * When true (default), the model can call multiple tools in parallel.
   * When false, the model calls tools sequentially.
   */
  parallelToolCalls: z.boolean().optional(),
  /**
   * A unique key for prompt caching. Sent as the `x-grok-conv-id` HTTP request header
   * and returned in the response body as `prompt_cache_key`.
   */
  promptCacheKey: z.string().optional(),
  /**
   * Controls how reasoning summaries are included in the response.
   * Use alongside `reasoningEffort` for fine-grained reasoning control.
   * Possible values: 'auto', 'concise', 'detailed'.
   */
  reasoningSummary: z.enum(['auto', 'concise', 'detailed']).optional(),
  /**
   * An end-user identifier for monitoring and safety purposes.
   */
  user: z.string().optional(),
});

export type XaiLanguageModelResponsesOptions = z.infer<
  typeof xaiLanguageModelResponsesOptions
>;
