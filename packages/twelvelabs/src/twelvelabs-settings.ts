export interface TwelveLabsProviderSettings {
  /**
   * Twelve Labs API key.
   * Can be set via TWELVELABS_API_KEY environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for Twelve Labs API.
   * Defaults to 'https://api.twelvelabs.io/v1.3'
   */
  baseURL?: string;

  /**
   * Name of the index to use for Pegasus model (generation/analysis).
   * Defaults to 'ai-sdk-pegasus'.
   * Can be set via TWELVELABS_PEGASUS_INDEX_NAME environment variable.
   */
  pegasusIndexName?: string;

  /**
   * Name of the index to use for Marengo model (search/embeddings).
   * Defaults to 'ai-sdk-marengo'.
   * Can be set via TWELVELABS_MARENGO_INDEX_NAME environment variable.
   */
  marengoIndexName?: string;

  /**
   * Custom headers to include in API requests.
   */
  headers?: Record<string, string>;
}

export interface TwelveLabsProviderMetadata {
  /**
   * ID of the video that was analyzed.
   */
  videoId?: string;

  /**
   * ID of the index where the video is stored.
   */
  indexId?: string;

  /**
   * Duration of the video in seconds.
   */
  videoDuration?: number;

  /**
   * Time taken to process the video in milliseconds.
   */
  processingTime?: number;

  /**
   * Whether a new video was uploaded.
   */
  newVideoUploaded?: boolean;
}

export type TwelveLabsModelId = 'pegasus1.2' | 'marengo2.7';

export type TwelveLabsEmbeddingModelId = 'marengo2.7';
