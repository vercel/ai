import type { SharedV4Headers } from '../../shared';
import type { SpeechModelV4StreamPart } from './speech-model-v4-stream-part';

/**
 * The result of a speech model doStream call.
 */
export type SpeechModelV4StreamResult = {
  /**
   * The stream.
   */
  stream: ReadableStream<SpeechModelV4StreamPart>;

  /**
   * Optional request information for telemetry and debugging purposes.
   */
  request?: {
    /**
     * Request body or setup payload that was sent to the provider API.
     */
    body?: unknown;
  };

  /**
   * Optional response data.
   */
  response?: {
    /**
     * Timestamp for the start of the streamed response.
     */
    timestamp?: Date;

    /**
     * The ID of the response model that was used to generate the response.
     */
    modelId?: string;

    /**
     * Response headers.
     */
    headers?: SharedV4Headers;

    /**
     * Response body.
     */
    body?: unknown;
  };
};
