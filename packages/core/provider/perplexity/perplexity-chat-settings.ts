import { LanguageModelSettings } from '../../core';

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
export interface PerplexityChatSettings extends LanguageModelSettings {
  /**
   * The ID of the model to use.
   */
  id: PerplexityChatModelId;

  /**
   * The maximum number of completion tokens returned by the API. The total number of
   * tokens requested in max_tokens plus the number of prompt tokens sent in messages
   * must not exceed the context window token limit of model requested. If left unspecified,
   * then the model will generate tokens until either it reaches its stop token or the
   * end of its context window.
   */
  maxTokens?: number;

  /**
   * The amount of randomness in the response, valued between 0 inclusive and 2 exclusive.
   * Higher values are more random, and lower values are more deterministic.
   */
  temperature?: number;

  /**
   * The nucleus sampling threshold, valued between 0 and 1 inclusive. For each subsequent token,
   * the model considers the results of the tokens with top_p probability mass. We recommend
   * either altering top_k or top_p, but not both.
   */
  topP?: number;

  /**
   * The number of tokens to keep for highest top-k filtering, specified as an
   * integer between 0 and 2048 inclusive. If set to 0, top-k filtering is disabled.
   * We recommend either altering top_k or top_p, but not both.
   */
  topK?: number;

  /**
   * A value between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear
   * in the text so far, increasing the model's likelihood to talk about new topics.
   * Incompatible with frequency_penalty.
   */
  presencePenalty?: number;

  /**
   * A multiplicative penalty greater than 0. Values greater than 1.0 penalize new tokens based
   * on their existing frequency in the text so far, decreasing the model's likelihood to repeat
   * the same line verbatim. A value of 1.0 means no penalty. Incompatible with presence_penalty.
   */
  frequencyPenalty?: number;
}
