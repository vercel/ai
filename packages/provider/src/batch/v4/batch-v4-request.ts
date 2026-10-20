/**
 * Fields shared by every request in a batch.
 */
export type BatchV4RequestBase<ModelId extends string = string> = {
  /**
   * Application-provided identifier used to correlate the request with its
   * result.
   */
  readonly id: string;

  /**
   * Provider-specific model ID for this request.
   */
  readonly modelId: ModelId;
};
