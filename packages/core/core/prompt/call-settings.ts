export type CallSettings = {
  /**
   * Maximum number of tokens to generate.
   */
  maxTokens?: number;

  /**
   * Temperature setting. This is a number between 0 (almost no randomness) and
   * 1 (very random).
   *
   * It is recommended to set either `temperature` or `topP`, but not both.
   */
  temperature?: number;

  /**
   * Nucleus sampling. This is a number between 0 and 1.
   *
   * E.g. 0.1 would mean that only tokens with the top 10% probability mass
   * are considered.
   *
   * It is recommended to set either `temperature` or `topP`, but not both.
   */
  topP?: number;

  /**
   * Presence penalty setting. This is a number between 0 (no penalty)
   * and 1 (maximum penalty). It affects the likelihood of the model to repeat
   * information that is already in the prompt.
   */
  presencePenalty?: number;

  /**
   * Frequency penalty setting. This is a number between 0 (no penalty)
   * and 1 (maximum penalty). It affects the likelihood of the model to
   * repeatedly use the same words or phrases.
   */
  frequencyPenalty?: number;

  /**
   * The seed to use for random sampling. If set and supported by the model,
   * calls will generate deterministic results.
   */
  seed?: number;
};
