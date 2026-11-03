import type { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import type { SharedV4Warning } from '../../shared/v4/shared-v4-warning';

/**
 * Result of downloading file content via the files interface.
 */
export type FilesV4DownloadFileResult = {
  /**
   * The file content as a byte stream.
   * The consumer is responsible for draining or cancelling the stream.
   */
  content: ReadableStream<Uint8Array>;

  /**
   * The IANA media type of the file, if available from the provider.
   */
  mediaType?: string;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: SharedV4ProviderMetadata;

  /**
   * Warnings from the provider.
   */
  warnings: Array<SharedV4Warning>;
};
