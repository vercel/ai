import { z } from 'zod/v4';

// https://docs.perplexity.ai/models/model-cards
export type PerplexityLanguageModelId =
  | 'sonar-deep-research'
  | 'sonar-reasoning-pro'
  | 'sonar-reasoning'
  | 'sonar-pro'
  | 'sonar'
  | (string & {});

/**
 * Provider-specific language model options for Perplexity.
 *
 * Perplexity uses an OpenAI-compatible API and supports additional parameters.
 * The AI SDK docs list the most common ones; any other Perplexity API parameters
 * can also be passed through (and are allowed by this schema).
 */
export const perplexityLanguageModelOptions = z
  .object({
    /**
     * Enable image responses.
     *
     * When set to `true`, the response may include relevant images.
     * This feature is only available to Perplexity Tier-2 users and above.
     */
    return_images: z.boolean().optional(),

    /**
     * Filter search results by recency.
     *
     * Possible values: `hour`, `day`, `week`, `month`.
     */
    search_recency_filter: z.enum(['hour', 'day', 'week', 'month']).optional(),

    /**
     * Filter web search results to a list of domains.
     *
     * Perplexity supports excluding domains by prefixing them with `-`.
     *
     * @example ['wikipedia.org', 'nature.com', '-reddit.com']
     */
    search_domain_filter: z.array(z.string()).optional(),

    /**
     * Return related questions.
     */
    return_related_questions: z.boolean().optional(),

    /**
     * Advanced web search configuration.
     */
    web_search_options: z
      .object({
        /**
         * Search context size (amount of context pulled from web results).
         */
        search_context_size: z.enum(['low', 'medium', 'high']).optional(),
      })
      .optional(),

    /**
     * Filter search results to those after a specific date.
     *
     * NOTE: Perplexity expects a string date; format depends on the API.
     */
    search_after_date_filter: z.string().optional(),

    /**
     * Filter search results to those before a specific date.
     *
     * NOTE: Perplexity expects a string date; format depends on the API.
     */
    search_before_date_filter: z.string().optional(),
  })
  .passthrough();

export type PerplexityLanguageModelOptions = z.infer<
  typeof perplexityLanguageModelOptions
>;
