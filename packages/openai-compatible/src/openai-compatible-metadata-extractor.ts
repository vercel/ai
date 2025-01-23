import { LanguageModelV1ProviderMetadata } from '@ai-sdk/provider';

/**
Extracts provider-specific metadata from API responses.
Used to standardize metadata handling across different LLM providers while allowing
provider-specific metadata to be captured.
*/
export type MetadataExtractor = {
  /**
   * Extracts provider metadata from a complete, non-streaming response.
   *
   * @param parsedBody - The parsed response JSON body from the provider's API.
   *
   * @returns Provider-specific metadata or undefined if no metadata is available.
   *          The metadata should be under a key indicating the provider id.
   */
  extractMetadata: ({
    parsedBody,
  }: {
    parsedBody: unknown;
  }) => LanguageModelV1ProviderMetadata | undefined;

  /**
   * Creates a streaming metadata processor that can accumulate and process chunks
   * of a streaming response. Used to build metadata progressively during streaming.
   *
   * @returns A new StreamingMetadataProcessor instance
   */
  createStreamExtractor: () => {
    /**
     * Process an individual chunk from the stream. Called for each chunk in the response stream
     * to accumulate metadata throughout the streaming process.
     *
     * @param parsedChunk - The parsed JSON response chunk from the provider's API
     */
    processChunk(parsedChunk: unknown): void;

    /**
     * Builds the metadata object after all chunks have been processed.
     * Called at the end of the stream to generate the complete provider metadata.
     *
     * @returns Provider-specific metadata or undefined if no metadata is available.
     *          The metadata should be under a key indicating the provider id.
     */
    buildMetadata(): LanguageModelV1ProviderMetadata | undefined;
  };
};
