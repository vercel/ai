import type { JSONValue } from '@ai-sdk/provider';

// https://docs.perplexity.ai/models/model-cards
export type PerplexityLanguageModelId =
  | 'sonar-deep-research'
  | 'sonar-reasoning-pro'
  | 'sonar-reasoning'
  | 'sonar-pro'
  | 'sonar'
  | (string & {});

export type PerplexityLanguageModelOptions = {
  /**
   * Enable image responses. This feature is only available to Perplexity
   * Tier-2 users and above.
   */
  return_images?: boolean;

  /**
   * Filter search results by recency. If not specified, defaults to all time.
   */
  search_recency_filter?: 'hour' | 'day' | 'week' | 'month' | 'year';

  /**
   * Additional Perplexity API parameters are passed through to the request.
   */
  [key: string]: JSONValue | undefined;
};
