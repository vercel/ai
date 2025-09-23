import { SharedV2Headers } from '../../shared';
import { SharedV2ProviderMetadata } from '../../shared/v2/shared-v2-provider-metadata';
import { LanguageModelV3CallOptions } from './language-model-v3-call-options';
import { LanguageModelV3CallWarning } from './language-model-v3-call-warning';
import { LanguageModelV3Content } from './language-model-v3-content';
import { LanguageModelV3FinishReason } from './language-model-v3-finish-reason';
import { LanguageModelV3ResponseMetadata } from './language-model-v3-response-metadata';
import { LanguageModelV3StreamPart } from './language-model-v3-stream-part';
import { LanguageModelV3Usage } from './language-model-v3-usage';

/**
Specification for a language model that implements the language model interface version 2.
 */
export type LanguageModelV3 = {
  /**
The language model must specify which language model interface version it implements.
   */
  readonly specificationVersion: 'v3';

  /**
Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
Supported URL patterns by media type for the provider.

The keys are media type patterns or full media types (e.g. `*\/*` for everything, `audio/*`, `video/*`, or `application/pdf`).
and the values are arrays of regular expressions that match the URL paths.

The matching should be against lower-case URLs.

Matched URLs are supported natively by the model and are not downloaded.

@returns A map of supported URL patterns by media type (as a promise or a plain object).
   */
  supportedUrls:
    | PromiseLike<Record<string, RegExp[]>>
    | Record<string, RegExp[]>;

  /**
Generates a language model output (non-streaming).

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   */
  doGenerate(options: LanguageModelV3CallOptions): PromiseLike<{
    /**
Ordered content that the model has generated.
     */
    content: Array<LanguageModelV3Content>;

    /**
Finish reason.
     */
    finishReason: LanguageModelV3FinishReason;

    /**
  Usage information.
     */
    usage: LanguageModelV3Usage;

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
    response?: LanguageModelV3ResponseMetadata & {
      /**
Response headers.
      */
      headers?: SharedV2Headers;

      /**
Response HTTP body.
*/
      body?: unknown;
    };

    /**
Warnings for the call, e.g. unsupported settings.
     */
    warnings: Array<LanguageModelV3CallWarning>;
  }>;

  /**
Generates a language model output (streaming).

Naming: "do" prefix to prevent accidental direct usage of the method
by the user.
   *
@return A stream of higher-level language model output parts.
   */
  doStream(options: LanguageModelV3CallOptions): PromiseLike<{
    stream: ReadableStream<LanguageModelV3StreamPart>;

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
      headers?: SharedV2Headers;
    };
  }>;
};
