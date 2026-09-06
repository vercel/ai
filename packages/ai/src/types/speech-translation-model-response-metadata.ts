/**
 * Response metadata for speech translation model calls.
 *
 * Experimental: part of the experimental speech translation modality and may
 * change in patch releases.
 */
export type SpeechTranslationModelResponseMetadata = {
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
  headers?: Record<string, string>;
};
