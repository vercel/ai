import { JSONValue } from '../../json-value';
import { VoiceChangerModelV1CallOptions } from './voice-changer-model-v1-call-options';
import { VoiceChangerModelV1CallWarning } from './voice-changer-model-v1-call-warning';

/**
Voice changer model specification version 1.
 */
export type VoiceChangerModelV1 = {
  /**
The voice changer model must specify which voice changer model interface
version it implements. This will allow us to evolve the voice changer
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
Generates a voice changer.
   */
  doGenerate(options: VoiceChangerModelV1CallOptions): PromiseLike<{
    /**
     * Generated audio as an ArrayBuffer.
     * The audio should be returned without any unnecessary conversion.
     * If the API returns base64 encoded strings, the audio should be returned
     * as base64 encoded strings. If the API returns binary data, the audio
     * should be returned as binary data.
     */
    audio: string | Uint8Array;

    /**
Warnings for the call, e.g. unsupported settings.
     */
    warnings: Array<VoiceChangerModelV1CallWarning>;

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
Response information for telemetry and debugging purposes.
     */
    response: {
      /**
Timestamp for the start of the generated response.
      */
      timestamp: Date;

      /**
The ID of the response model that was used to generate the response.
      */
      modelId: string;

      /**
Response headers.
      */
      headers: Record<string, string> | undefined;

      /**
Response body.
      */
      body?: unknown;
    };

    /**
Additional provider-specific metadata. They are passed through
from the provider to the AI SDK and enable provider-specific
results that can be fully encapsulated in the provider.
     */
    providerMetadata?: Record<string, Record<string, JSONValue>>;
  }>;
};
