export type GoogleGenerativeAIEmbeddingModelId =
  | 'text-embedding-004'
  | (string & {});

export interface GoogleGenerativeAIEmbeddingSettings {
  /**
   * Optional. Optional reduced dimension for the output embedding.
   * If set, excessive values in the output embedding are truncated from the end.
   */
  outputDimensionality?: number;
}
