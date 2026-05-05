import { z } from 'zod/v4';

export const perplexityLanguageModelOptions = z.object({
  /**
   * Filters search results to those published within the specified time window.
   * Ignored if `search_recency_filter` is already set in the request.
   */
  search_recency_filter: z.enum(['month', 'week', 'day', 'hour']).optional(),

  /**
   * Restrict web search results to specific domains (up to 3 domains).
   * Prefix a domain with "-" to exclude it.
   */
  search_domain_filter: z.array(z.string()).optional(),

  /**
   * If true, a list of related questions is included in the response.
   */
  return_related_questions: z.boolean().optional(),

  /**
   * If true, image search results are included in the response.
   */
  return_images: z.boolean().optional(),

  /**
   * Additional web search configuration.
   */
  web_search_options: z
    .object({
      /**
       * Controls the size of search context injected into the model.
       */
      search_context_size: z.enum(['low', 'medium', 'high']).optional(),
    })
    .optional(),
});

export type PerplexityLanguageModelOptions = z.infer<
  typeof perplexityLanguageModelOptions
>;
