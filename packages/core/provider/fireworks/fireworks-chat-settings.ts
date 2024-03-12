export type FireworksChatModelId = `accounts/${string}/models/${string}`;

/**
 * @see https://readme.fireworks.ai/reference/createchatcompletion
 */
export interface FireworksChatSettings {
  /**
   * The ID of the model to use.
   */
  id: FireworksChatModelId;

  /**
   * The size to which to truncate chat prompts. Earlier user/assistant messages will be
   * evicted to fit the prompt into this length.
   *
   * This should usually be set to a number << the max context size of the model, to allow
   * enough remaining tokens for generating a response.
   *
   * If omitted, you may receive "prompt too long" errors in your responses as
   * conversations grow. Note that even with this set, you may still receive "prompt too long"
   * errors if individual messages are too long for the model context window.
   */
  promptTruncateLength?: number;

  /**
   * Top-k sampling is another sampling method where the k most probable next tokens are filtered
   * and the probability mass is redistributed among only those k next tokens. The value of k
   * controls the number of candidates for the next token at each step during text generation.
   */
  topK?: number;

  /**
   * What to do if the token count of prompt plus max_tokens exceeds the model's context window.
   *
   * Passing truncate limits the max_tokens to at most context_window_length - prompt_length.
   * This is the default.
   *
   * Passing error would trigger a request error.
   *
   * The default of 'truncate' is selected as it allows to ask for high max_tokens value while
   * respecting the context window length without having to do client-side prompt tokenization.
   *
   * Note, that it differs from OpenAI's behavior that matches that of error.
   */
  contextLengthExceededBehavior?: 'truncate' | 'error';
}
