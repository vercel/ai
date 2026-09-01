/**
 * Fields shared by every request in a batch.
 */
export type BatchV4Request<
  ModelId extends string = string,
  Options = unknown,
> = {
  /**
   * Application-provided identifier used to correlate the request with its
   * result.
   */
  readonly id: string;

  /**
   * Provider-specific model ID for this request.
   */
  readonly modelId: ModelId;

  /**
   * Modality-specific normalized call options for this request.
   */
  readonly options: Options;
};
