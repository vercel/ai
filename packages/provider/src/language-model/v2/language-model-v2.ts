import { SharedV2ProviderMetadata } from '../../shared/v2/shared-v2-provider-metadata';
import { LanguageModelV2CallOptions } from './language-model-v2-call-options';
import { LanguageModelV2CallWarning } from './language-model-v2-call-warning';
import { LanguageModelV2File } from './language-model-v2-file';
import { LanguageModelV2FinishReason } from './language-model-v2-finish-reason';
import { LanguageModelV2LogProbs } from './language-model-v2-logprobs';
import { LanguageModelV2Source } from './language-model-v2-source';
import { LanguageModelV2ToolCall } from './language-model-v2-tool-call';
import { LanguageModelV2ToolCallDelta } from './language-model-v2-tool-call-delta';
import { LanguageModelV2Usage } from './language-model-v2-usage';

/**
Specification for a language model that implements the language model interface version 2.
 */
export type LanguageModelV2 = {
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
  readonly defaultObjectGenerationMode: LanguageModelV2ObjectGenerationMode;

  /**
Flag whether this model supports image URLs. Default is `true`.

When the flag is set to `false`, the AI SDK will download the image and
pass the image data to the model.
   */
  // TODO generalize to file urls in language model v2
  readonly supportsImageUrls?: boolean;

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

Defaults to `false`.
*/
  // TODO v2: rename to supportsGrammarGuidedGeneration? supports output schemas?
  readonly supportsStructuredOutputs?: boolean;

  /**
Checks if the model supports the given URL for file parts natively.
If the model does not support the URL,
the AI SDK will download the file and pass the file data to the model.

When undefined, the AI SDK will download the file.
   */
  supportsUrl?(url: URL): boolean;

  /**
Generates a language model output (non-streaming).

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doGenerate(options: LanguageModelV2CallOptions): PromiseLike<{
    // TODO v2: switch to a composite content array with text, tool calls, reasoning, files

    /**
Text that the model has generated.
Can be undefined if the model did not generate any text.
     */
    text?: string;

    /**
Reasoning that the model has generated.
Can be undefined if the model does not support reasoning.
     */
    // TODO v2: remove string option
    reasoning?:
      | string
      | Array<
          | {
              type: 'text';
              text: string;

              /**
An optional signature for verifying that the reasoning originated from the model.
   */
              signature?: string;
            }
          | {
              type: 'redacted';
              data: string;
            }
        >;

    /**
Generated files as base64 encoded strings or binary data.
The files should be returned without any unnecessary conversion.
     */
    files?: Array<LanguageModelV2File>;

    /**
Sources that have been used as input to generate the response.
 */
    sources?: LanguageModelV2Source[];

    /**
Tool calls that the model has generated.
Can be undefined if the model did not generate any tool calls.
     */
    toolCalls?: Array<LanguageModelV2ToolCall>;

    /**
Logprobs for the completion.
`undefined` if the mode does not support logprobs or if was not enabled

@deprecated will be changed into a provider-specific extension in v2
 */
    // TODO change in language model v2
    logprobs?: LanguageModelV2LogProbs;

    /**
Finish reason.
     */
    finishReason: LanguageModelV2FinishReason;

    /**
  Usage information.
     */
    usage: LanguageModelV2Usage;

    /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
     */
    providerMetadata?: SharedV2ProviderMetadata;

    /**
Optional request information for telemetry and debugging purposes.
     */
    request?: {
      /**
Request HTTP body that was sent to the provider API.
       */
      body?: unknown;
    };

    /**
Optional response information for telemetry and debugging purposes.
     */
    response?: {
      /**
ID for the generated response, if the provider sends one.
     */
      id?: string;

      /**
Timestamp for the start of the generated response, if the provider sends one.
     */
      timestamp?: Date;

      /**
The ID of the response model that was used to generate the response, if the provider sends one.
     */
      modelId?: string;

      /**
Response headers.
      */
      headers?: Record<string, string>;

      /**
Response HTTP body.
*/
      body?: unknown;
    };

    /**
Warnings for the call, e.g. unsupported settings.
     */
    warnings?: LanguageModelV2CallWarning[];
  }>;

  /**
Generates a language model output (streaming).

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   *
@return A stream of higher-level language model output parts.
   */
  doStream(options: LanguageModelV2CallOptions): PromiseLike<{
    stream: ReadableStream<LanguageModelV2StreamPart>;

    /**
Optional request information for telemetry and debugging purposes.
     */
    request?: {
      /**
Request HTTP body that was sent to the provider API.
   */
      body?: unknown;
    };

    /**
Optional response data.
     */
    response?: {
      /**
Response headers.
       */
      headers?: Record<string, string>;
    };

    /**
Warnings for the call, e.g. unsupported settings.
     */
    warnings?: Array<LanguageModelV2CallWarning>;
  }>;
};

export type LanguageModelV2StreamPart =
  // Basic text deltas:
  | { type: 'text-delta'; textDelta: string }

  // Reasoning text deltas:
  // TODO refactor to use the new reasoning type
  | { type: 'reasoning'; textDelta: string }
  | { type: 'reasoning-signature'; signature: string }
  | { type: 'redacted-reasoning'; data: string }

  // Sources:
  | { type: 'source'; source: LanguageModelV2Source }

  // Files:
  | { type: 'file'; file: LanguageModelV2File }

  // Tool calls:
  | { type: 'tool-call'; toolCall: LanguageModelV2ToolCall }
  | { type: 'tool-call-delta'; toolCallDelta: LanguageModelV2ToolCallDelta }

  // metadata for the response.
  // separate stream part so it can be sent once it is available.
  | {
      type: 'response-metadata';
      id?: string;
      timestamp?: Date;
      modelId?: string;
    }

  // the usage stats, finish reason and logprobs should be the last part of the
  // stream:
  | {
      type: 'finish';
      finishReason: LanguageModelV2FinishReason;
      providerMetadata?: SharedV2ProviderMetadata;
      usage: LanguageModelV2Usage;

      // @deprecated - will be changed into a provider-specific extension in v2
      logprobs?: LanguageModelV2LogProbs;
    }

  // error parts are streamed, allowing for multiple errors
  | { type: 'error'; error: unknown };

/**
The object generation modes available for use with a model. `undefined`
represents no support for object generation.
   */
export type LanguageModelV2ObjectGenerationMode = 'json' | 'tool' | undefined;
