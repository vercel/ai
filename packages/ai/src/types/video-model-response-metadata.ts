/**
 * Response metadata for a video model call.
 */
export type VideoModelResponseMetadata = {
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
