export type PerplexityChatModelId =
  | 'sonar-small-chat'
  | 'sonar-small-online'
  | 'sonar-medium-chat'
  | 'sonar-medium-online'
  | 'mistral-7b-instruct'
  | 'mixtral-8x7b-instruct'
  | (string & {});

/**
 * @see https://docs.perplexity.ai/reference/post_chat_completions
 */
export interface PerplexityChatSettings {
  /**
   * The ID of the model to use.
   */
  id: PerplexityChatModelId;

  /**
   * The number of tokens to keep for highest top-k filtering, specified as an
   * integer between 0 and 2048 inclusive. If set to 0, top-k filtering is disabled.
   * We recommend either altering top_k or top_p, but not both.
   */
  topK?: number;
}
