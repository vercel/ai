import { LanguageModelV1ProviderMetadata } from '@ai-sdk/provider';

export interface StreamingMetadataProcessor {
  /**
 Process an individual chunk from the stream
   */
  processChunk(chunk: unknown): void;

  /**
Builds the final metadata after all chunks have been processed
   */
  buildFinalMetadata(): LanguageModelV1ProviderMetadata | undefined;
}

export type MetadataProcessor = {
  /**
Builds provider metadata from a complete response
   */
  buildMetadataFromResponse: (
    response: unknown,
  ) => LanguageModelV1ProviderMetadata | undefined;

  /**
Creates a streaming metadata processor that can accumulate and process chunks
   */
  createStreamingMetadataProcessor: () => StreamingMetadataProcessor;
};
