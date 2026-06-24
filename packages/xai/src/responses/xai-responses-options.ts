import { z } from 'zod/v4';

export type XaiResponsesModelId =
  | 'grok-4.3'
  | 'grok-4.20-0309-reasoning'
  | 'grok-4.20-0309-non-reasoning'
  | 'grok-4.20-multi-agent-0309'
  | 'grok-build-0.1'
  | (string & {});

/**
 * @see https://docs.x.ai/docs/api-reference#create-new-response
 */
export const xaiLanguageModelResponsesOptions = z.object({
  /**
   * Constrains how hard a reasoning model thinks before responding.
   * Possible values are `none` (disables reasoning), `low` (uses fewer reasoning
   * tokens), `medium` and `high` (uses more reasoning tokens). Not all models
   * support reasoning effort; see xAI's docs for the values each model accepts.
   */
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).optional(),
  logprobs: z.boolean().optional(),
  topLogprobs: z.number().int().min(0).max(8).optional(),
  /**
   * Whether to store the input message(s) and model response for later retrieval.
   * Must be set to `false` for teams with Zero Data Retention (ZDR) enabled,
   * otherwise the API will return an error.
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
});

export type XaiLanguageModelResponsesOptions = z.infer<
  typeof xaiLanguageModelResponsesOptions
>;
