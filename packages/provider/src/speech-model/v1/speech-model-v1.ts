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
     * The audio data as a binary buffer.
     */
    audioData: ArrayBuffer;

    /**
     * The MIME type of the audio data.
     * For example: 'audio/mp3', 'audio/wav', etc.
     */
    contentType: string;

    /**
     * Warnings for the call, e.g. unsupported settings.
     */
    warnings: Array<SpeechModelV1CallWarning>;

    /**
     * Optional request information for telemetry and debugging purposes.
     */
    request?: {
      /**
       * Raw request HTTP body that was sent to the provider API as a string (JSON should be stringified).
       * Non-HTTP(s) providers should not set this.
       */
      body?: string;
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
