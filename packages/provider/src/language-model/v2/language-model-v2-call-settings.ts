import { JSONSchema7 } from 'json-schema';

export type LanguageModelV2CallSettings = {
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
Stop sequences.
If set, the model will stop generating text when one of the stop sequences is generated.
Providers may have limits on the number of stop sequences.
   */
  stopSequences?: string[];

  /**
Nucleus sampling.

It is recommended to set either `temperature` or `topP`, but not both.
   */
  topP?: number;

  /**
Only sample from the top K options for each subsequent token.

Used to remove "long tail" low probability responses.
Recommended for advanced use cases only. You usually only need to use temperature.
   */
  topK?: number;

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
Response format. The output can either be text or JSON. Default is text.

If JSON is selected, a schema can optionally be provided to guide the LLM.
   */
  responseFormat?:
    | { type: 'text' }
    | {
        type: 'json';

        /**
         * JSON schema that the generated output should conform to.
         */
        schema?: JSONSchema7;

        /**
         * Name of output that should be generated. Used by some providers for additional LLM guidance.
         */
        name?: string;

        /**
         * Description of the output that should be generated. Used by some providers for additional LLM guidance.
         */
        description?: string;
      };

  /**
The seed (integer) to use for random sampling. If set and supported
by the model, calls will generate deterministic results.
   */
  seed?: number;

  /**
Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
Additional HTTP headers to be sent with the request.
Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;
};
