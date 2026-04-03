export type ZeroEntropyEmbeddingModelId = 'zembed-1' | (string & {});

export interface ZeroEntropyEmbeddingModelOptions {
  /**
   * Whether the input is a query or a document.
   * Required for asymmetric retrieval with zembed-1.
   * Defaults to 'query'.
   */
  inputType?: 'query' | 'document';

  /**
   * Output dimension size. Must be one of: 2560, 1280, 640, 320, 160, 80, 40.
   * Defaults to 2560 (highest accuracy).
   */
  dimensions?: 2560 | 1280 | 640 | 320 | 160 | 80 | 40;

  /**
   * Latency mode. 'fast' targets sub-second latency, 'slow' targets higher
   * throughput. Defaults to null (auto).
   */
  latency?: 'fast' | 'slow';
}
