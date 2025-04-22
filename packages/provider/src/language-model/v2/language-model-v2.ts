import { SharedV2ProviderMetadata } from '../../shared/v2/shared-v2-provider-metadata';
import { LanguageModelV2CallOptions } from './language-model-v2-call-options';
import { LanguageModelV2CallWarning } from './language-model-v2-call-warning';
import { LanguageModelV2Content } from './language-model-v2-content';
import { LanguageModelV2FinishReason } from './language-model-v2-finish-reason';
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
   * Returns a map of supported URL patterns for the model.
   * The keys are media type patterns or full media types (e.g. `*\/*` for everything, `audio/*`, `video/*`, or `application/pdf`).
   * and the values are arrays of regular expressions that match the URL paths.
   *
   * The matching should be against lower-case URLs.
   *
   * Matched URLs are supported natively by the model and are not downloaded.
   *
   * @returns A promise resolving to a map of supported URL patterns.
   */
  getSupportedUrls(): PromiseLike<Record<string, RegExp[]>>;

  /**
Generates a language model output (non-streaming).

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doGenerate(options: LanguageModelV2CallOptions): PromiseLike<{
    /**
Ordered content that the model has generated.
     */
    content: Array<LanguageModelV2Content>;

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
    warnings: Array<LanguageModelV2CallWarning>;
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
  }>;
};

export type LanguageModelV2StreamPart =
  // Content (similar to doGenerate):
  | LanguageModelV2Content

  // Tool calls delta:
  | LanguageModelV2ToolCallDelta

  // stream start event with warnings for the call, e.g. unsupported settings:
  | {
      type: 'stream-start';
      warnings: Array<LanguageModelV2CallWarning>;
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
      finishReason: LanguageModelV2FinishReason;
      providerMetadata?: SharedV2ProviderMetadata;
      usage: LanguageModelV2Usage;
    }

  // error parts are streamed, allowing for multiple errors
  | { type: 'error'; error: unknown };
