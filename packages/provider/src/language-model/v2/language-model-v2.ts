import { JSONValue } from '../../json-value';
import { LanguageModelV2FinishReason } from './language-model-v2-finish-reason';
import { LanguageModelV2FunctionToolCall } from './language-model-v2-function-tool-call';
import { LanguageModelV2LogProbs } from './language-model-v2-logprobs';
import { LanguageModelV2RequestOptions } from './language-model-v2-request-options';
import { LanguageModelV2ResponseProperties } from './language-model-v2-response-properties';
import { LanguageModelV2Source } from './language-model-v2-source';
import { LanguageModelV2StreamChunk } from './language-model-v2-stream-chunk';
import { LanguageModelV2Usage } from './language-model-v2-usage';

/**
Specification for a language model that implements the language model interface version 2.
 */
export interface LanguageModelV2 {
  /**
The language model must specify which language model interface
version it implements. This will allow us to evolve the language
model interface and retain backwards compatibility. The different
implementation versions can be handled as a discriminated union
on our side.
   */
  readonly specificationVersion: 'v2';

  /**
Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
Default object generation mode that should be used with this model when
no mode is specified. Should be the mode with the best results for this
model. `undefined` can be returned if object generation is not supported.

This is needed to generate the best objects possible w/o requiring the
user to explicitly specify the object generation mode.
   */
  readonly defaultObjectGenerationMode: 'json' | 'tool' | undefined;

  /**
Flag whether this model supports image URLs.

When the flag is set to `false`, the AI SDK will download the image and
pass the image data to the model.
   */
  readonly supportsImageUrls: boolean;

  /**
Flag whether this model supports grammar-guided generation,
i.e. follows JSON schemas for object generation
when the response format is set to 'json' or
when the `object-json` mode is used.

This means that the model guarantees that the generated JSON
will be a valid JSON object AND that the object will match the
JSON schema.

Please note that `generateObject` and `streamObject` will work
regardless of this flag, but might send different prompts and
use further optimizations if this flag is set to `true`.
*/
  readonly supportsGrammarGuidedGeneration: boolean;

  /**
Generates a language model output (non-streaming).

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doGenerate(options: LanguageModelV2RequestOptions): PromiseLike<
    LanguageModelV2ResponseProperties & {
      /**
Text that the model has generated. Can be undefined if the model
has only generated tool calls.
     */
      text: string | undefined;

      /**
       * The ID of the model that generated the response.
       * Should be a concrete model that is extracted from the LLM provider response.
       */
      responseModelId: string | undefined;

      /**
       * The ID of the response.
       */
      responseId: string | undefined;

      /**
Tool calls that the model has generated. Can be undefined if the
model has only generated text.
     */
      toolCalls: Array<LanguageModelV2FunctionToolCall> | undefined;

      /**
Grounding sources that the model has used to generate the response.
       */
      sources?: Array<LanguageModelV2Source> | undefined;

      /**
Finish reason.
     */
      finishReason: LanguageModelV2FinishReason;

      /**
Usage information.
     */
      usage: LanguageModelV2Usage;

      /**
Logprobs for the completion.
`undefined` if the mode does not support logprobs or if was not enabled
     */
      logprobs?: LanguageModelV2LogProbs;

      /**
Provider-specific information, e.g. advanced token usage information.
       */
      providerMetadata?: Record<string, JSONValue>;
    }
  >;

  /**
Generates a language model output (streaming).

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   *
@return A stream of higher-level language model output parts.
   */
  doStream(options: LanguageModelV2RequestOptions): PromiseLike<
    LanguageModelV2ResponseProperties & {
      /**
The stream of language model output chunks.
       */
      stream: ReadableStream<LanguageModelV2StreamChunk>;
    }
  >;
}
