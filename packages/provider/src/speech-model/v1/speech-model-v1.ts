import { JSONValue } from '../../json-value';
import { SpeechModelV1CallOptions } from './speech-model-v1-call-options';
import { SpeechModelV1CallWarning } from './speech-model-v1-call-warning';

/**
 * Speech model specification version 1.
 */
export type SpeechModelV1 = {
  /**
   * The speech model must specify which speech model interface
   * version it implements. This will allow us to evolve the speech
   * model interface and retain backwards compatibility. The different
   * implementation versions can be handled as a discriminated union
   * on our side.
   */
  readonly specificationVersion: 'v1';

  /**
   * Name of the provider for logging purposes.
   */
  readonly provider: string;

  /**
   * Provider-specific model ID for logging purposes.
   */
  readonly modelId: string;

  /**
   * Generates speech audio from text.
   */
  doGenerate(options: SpeechModelV1CallOptions): PromiseLike<{
    /**
     * Generated audio as an ArrayBuffer.
     * The audio should be returned without any unnecessary conversion.
     * If the API returns base64 encoded strings, the audio should be returned
     * as base64 encoded strings. If the API returns binary data, the audio
     * should be returned as binary data.
     */
    audio: string | Uint8Array;

    /**
     * Warnings for the call, e.g. unsupported settings.
     */
    warnings: Array<SpeechModelV1CallWarning>;

    /**
     * Optional request information for telemetry and debugging purposes.
     */
    request?: {
      /**
       * Response body (available only for providers that use HTTP requests).
       */
      body?: unknown;
    };

    /**
     * Response information for telemetry and debugging purposes.
     */
    response: {
      /**
       * Timestamp for the start of the generated response.
       */
      timestamp: Date;

      /**
       * The ID of the response model that was used to generate the response.
       */
      modelId: string;

      /**
       * Response headers.
       */
      headers: Record<string, string> | undefined;

      /**
       * Response body.
       */
      body?: unknown;
    };

    /**
     * Additional provider-specific metadata. They are passed through
     * from the provider to the AI SDK and enable provider-specific
     * results that can be fully encapsulated in the provider.
     */
    providerMetadata?: Record<string, Record<string, JSONValue>>;
  }>;
};
