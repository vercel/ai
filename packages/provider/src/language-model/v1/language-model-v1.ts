import { LanguageModelV1CallOptions } from './language-model-v1-call-options';
import { LanguageModelV1CallWarning } from './language-model-v1-call-warning';
import { LanguageModelV1FinishReason } from './language-model-v1-finish-reason';
import { LanguageModelV1FunctionToolCall } from './language-model-v1-function-tool-call';
import { LanguageModelV1LogProbs } from './language-model-v1-logprobs';
import { LanguageModelV1ProviderMetadata } from './language-model-v1-provider-metadata';
import { LanguageModelV1Source } from './language-model-v1-source';

/**
Specification for a language model that implements the language model interface version 1.
 */
export type LanguageModelV1 = {
  /**
The language model must specify which language model interface
version it implements. This will allow us to evolve the language
model interface and retain backwards compatibility. The different
implementation versions can be handled as a discriminated union
on our side.
   */
  readonly specificationVersion: 'v1';

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
  readonly defaultObjectGenerationMode: LanguageModelV1ObjectGenerationMode;

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
  // TODO v2: rename to supportsGrammarGuidedGeneration?
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
  doGenerate(options: LanguageModelV1CallOptions): PromiseLike<{
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
If the API returns base64 encoded strings, the files should be returned
as base64 encoded strings. If the API returns binary data, the files should
be returned as binary data.
     */
    files?: Array<{
      data: string | Uint8Array;
      mimeType: string;
    }>;

    /**
Tool calls that the model has generated.
Can be undefined if the model did not generate any tool calls.
     */
    toolCalls?: Array<LanguageModelV1FunctionToolCall>;

    /**
Finish reason.
     */
    finishReason: LanguageModelV1FinishReason;

    /**
  Usage information.
     */
    usage: {
      promptTokens: number;
      completionTokens: number;
    };

    /**
Raw prompt and setting information for observability provider integration.
     */
    // TODO v2: remove in v2 (now there is request)
    rawCall: {
      /**
Raw prompt after expansion and conversion to the format that the
provider uses to send the information to their API.
       */
      rawPrompt: unknown;

      /**
Raw settings that are used for the API call. Includes provider-specific
settings.
       */
      rawSettings: Record<string, unknown>;
    };

    /**
Optional response information for telemetry and debugging purposes.
     */
    // TODO rename to `response` in v2
    rawResponse?: {
      /**
Response headers.
      */
      headers?: Record<string, string>;

      /**
Response body.
      */
      body?: unknown;
    };

    /**
Optional request information for telemetry and debugging purposes.
     */
    request?: {
      /**
Raw request HTTP body that was sent to the provider API as a string (JSON should be stringified).
Non-HTTP(s) providers should not set this.
       */
      body?: string;
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
    };

    warnings?: LanguageModelV1CallWarning[];

    /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
     */
    providerMetadata?: LanguageModelV1ProviderMetadata;

    /**
Sources that have been used as input to generate the response.
     */
    sources?: LanguageModelV1Source[];

    /**
Logprobs for the completion.
`undefined` if the mode does not support logprobs or if was not enabled

@deprecated will be changed into a provider-specific extension in v2
     */
    // TODO change in language model v2
    logprobs?: LanguageModelV1LogProbs;
  }>;

  /**
Generates a language model output (streaming).

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   *
@return A stream of higher-level language model output parts.
   */
  doStream(options: LanguageModelV1CallOptions): PromiseLike<{
    stream: ReadableStream<LanguageModelV1StreamPart>;

    /**
Raw prompt and setting information for observability provider integration.
     */
    // TODO remove in v2 (there is now request)
    rawCall: {
      /**
Raw prompt after expansion and conversion to the format that the
provider uses to send the information to their API.
       */
      rawPrompt: unknown;

      /**
Raw settings that are used for the API call. Includes provider-specific
settings.
       */
      rawSettings: Record<string, unknown>;
    };

    /**
Optional raw response data.
     */
    // TODO rename to response in v2
    rawResponse?: {
      /**
Response headers.
       */
      headers?: Record<string, string>;
    };

    /**
Optional request information for telemetry and debugging purposes.
     */
    request?: {
      /**
Raw request HTTP body that was sent to the provider API as a string (JSON should be stringified).
Non-HTTP(s) providers should not set this.
   */
      body?: string;
    };

    /**
Warnings for the call, e.g. unsupported settings.
     */
    warnings?: Array<LanguageModelV1CallWarning>;
  }>;
};

export type LanguageModelV1StreamPart =
  // Basic text deltas:
  | { type: 'text-delta'; textDelta: string }

  // Reasoning text deltas:
  | { type: 'reasoning'; textDelta: string }
  | { type: 'reasoning-signature'; signature: string }
  | { type: 'redacted-reasoning'; data: string }

  // Sources:
  | { type: 'source'; source: LanguageModelV1Source }

  // Files:
  | {
      type: 'file';
      mimeType: string;

      /**
Generated file data as base64 encoded strings or binary data.
The file data should be returned without any unnecessary conversion.
If the API returns base64 encoded strings, the file data should be returned
as base64 encoded strings. If the API returns binary data, the file data should
be returned as binary data.
       */
      data: string | Uint8Array;
    }

  // Complete tool calls:
  | ({ type: 'tool-call' } & LanguageModelV1FunctionToolCall)

  // Tool call deltas are only needed for object generation modes.
  // The tool call deltas must be partial JSON strings.
  | {
      type: 'tool-call-delta';
      toolCallType: 'function';
      toolCallId: string;
      toolName: string;
      argsTextDelta: string;
    }

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
      finishReason: LanguageModelV1FinishReason;
      providerMetadata?: LanguageModelV1ProviderMetadata;
      usage: { promptTokens: number; completionTokens: number };

      // @deprecated - will be changed into a provider-specific extension in v2
      logprobs?: LanguageModelV1LogProbs;
    }

  // error parts are streamed, allowing for multiple errors
  | { type: 'error'; error: unknown };

/**
The object generation modes available for use with a model. `undefined`
represents no support for object generation.
   */
export type LanguageModelV1ObjectGenerationMode = 'json' | 'tool' | undefined;
