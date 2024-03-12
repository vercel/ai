export type LanguageModelV1CallSettings = {
  /**
   * Maximum number of tokens to generate.
   */
  maxTokens?: number;

  /**
   * Temperature setting. This is a number between 0 (almost no randomness) and
   * 1 (very random).
   *
   * Different LLM providers have different temperature
   * scales, so they'd need to map it (without mapping, the same temperature has
   * different effects on different models). The provider can also chose to map
   * this to topP, potentially even using a custom setting on their model.
   *
   * Note: This is an example of a setting that requires a clear specification of
   * the semantics.
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
   * and 1 (maximum penalty). It affects the likelihood of the model to repeatedly
   * use the same words or phrases.
   */
  frequencyPenalty?: number;

  /**
   * The seed to use for random sampling. If set and supported by the model,
   * calls will generate deterministic results.
   */
  seed?: number;
};
