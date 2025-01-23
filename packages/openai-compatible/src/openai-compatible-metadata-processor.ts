import { LanguageModelV1ProviderMetadata } from '@ai-sdk/provider';

/**
A streaming metadata processor that can accumulate and process chunks
of streaming content from an LLM response stream.
*/
export interface StreamingMetadataProcessor {
  /**
   * Process an individual chunk from the stream. Called for each chunk in the response stream
   * to accumulate metadata throughout the streaming process.
   *
   * @param chunk - The raw response chunk from the provider's API
   */
  processChunk(chunk: unknown): void;

  /**
   * Builds the final metadata object after all chunks have been processed.
   * Called at the end of the stream to generate the complete provider metadata.
   *
   * @returns Provider-specific metadata or undefined if no metadata is available
   */
  buildFinalMetadata(): LanguageModelV1ProviderMetadata | undefined;
}

/**
A metadata processor that enables extraction of provider-specific metadata from API responses.
Used to standardize metadata handling across different LLM providers while allowing
provider-specific metadata to be captured.
*/
export type MetadataProcessor = {
  /**
   * Builds provider metadata from a complete, non-streaming response.
   *
   * @param response - The raw response from the provider's API
   * @returns Provider-specific metadata or undefined if no metadata is available
   */
  buildMetadataFromResponse: (
    response: unknown,
  ) => LanguageModelV1ProviderMetadata | undefined;

  /**
   * Creates a streaming metadata processor that can accumulate and process chunks
   * of a streaming response. Used to build metadata progressively during streaming.
   *
   * @returns A new StreamingMetadataProcessor instance
   */
  createStreamingMetadataProcessor: () => StreamingMetadataProcessor;
};
