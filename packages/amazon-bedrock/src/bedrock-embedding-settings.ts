export type BedrockEmbeddingModelId =
  | 'amazon.titan-embed-text-v1'
  | 'amazon.titan-embed-text-v2:0'
  | 'cohere.embed-english-v3'
  | 'cohere.embed-multilingual-v3'
  | (string & {});

export interface BedrockEmbeddingSettings {
  /**
The number of dimensions the resulting output embeddings should have (defaults to 1024).
Only supported in amazon.titan-embed-text-v2:0.
   */
  dimensions?: 1024 | 512 | 256;

  /**
Flag indicating whether or not to normalize the output embeddings. Defaults to true
Only supported in amazon.titan-embed-text-v2:0.
   */
  normalize?: boolean;
}
