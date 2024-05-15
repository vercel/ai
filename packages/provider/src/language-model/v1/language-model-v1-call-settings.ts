export type LanguageModelV1CallSettings = {
  /**
Maximum number of tokens to generate.
   */
  maxTokens?: number;

  /**
Temperature setting.

It is recommended to set either `temperature` or `topP`, but not both.
   */
  temperature?: number;

  /**
Nucleus sampling.

It is recommended to set either `temperature` or `topP`, but not both.
   */
  topP?: number;

  /**
Presence penalty setting. It affects the likelihood of the model to
repeat information that is already in the prompt.
   */
  presencePenalty?: number;

  /**
Frequency penalty setting. It affects the likelihood of the model
to repeatedly use the same words or phrases.
   */
  frequencyPenalty?: number;

  /**
The seed (integer) to use for random sampling. If set and supported
by the model, calls will generate deterministic results.
   */
  seed?: number;

  /**
Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;
};
