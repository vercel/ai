export type BedrockEmbeddingModelId =
  | 'amazon.titan-embed-text-v1'
  | 'amazon.titan-embed-text-v2:0'
  | 'cohere.embed-english-v3'
  | 'cohere.embed-multilingual-v3'
  | (string & {});

/**
 * Required settings for Cohere embedding models
 */
export interface CohereEmbeddingSettings {
  /**
   * Prepends special tokens to differentiate each type from one another (default: "search_document").
   */
  input_type?:
    | 'search_document'
    | 'search_query'
    | 'classification'
    | 'clustering'
    | 'image';

  /**
   * Specifies how the API handles inputs longer than the maximum token length.
   */
  truncate?: 'NONE' | 'START' | 'END';

  /**
   * Specifies the types of embeddings you want to have returned.
   */
  embedding_types?: Array<'float' | 'int8' | 'uint8' | 'binary' | 'ubinary'>;

  /**
   * An array of image data URIs for the model to embed.
   * Maximum number of images per call is 1 (i.e, the model only supports one image input).
   * The image must be a valid data URI in either image/jpeg or image/png format with max size of 5MB.
   * NOTE: Only one of either "images" or "texts" must be provided.
   */
  images?: string[];
}

export interface BedrockEmbeddingSettings {
  /**
   * The number of dimensions the resulting output embeddings should have (defaults to 1024).
   * Only supported in amazon.titan-embed-text-v2:0.
   */
  dimensions?: 1024 | 512 | 256;

  /**
   * Flag indicating whether or not to normalize the output embeddings. Defaults to true.
   * Only supported in amazon.titan-embed-text-v2:0.
   */
  normalize?: boolean;

  /**
   * Settings specific to Cohere embedding models.
   */
  cohere?: CohereEmbeddingSettings;
}
