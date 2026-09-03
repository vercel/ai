import type { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import type { SharedV4ProviderReference } from '../../shared/v4/shared-v4-provider-reference';
import type { SharedV4Warning } from '../../shared/v4/shared-v4-warning';

/**
 * Result of retrieving file metadata via the files interface.
 */
export type FilesV4GetFileMetadataResult = {
  /**
   * A provider reference mapping provider names to provider-specific file identifiers.
   * Contains only the operated provider's entry — when working with a merged
   * multi-provider reference, do not reassign it with this result.
   */
  providerReference: SharedV4ProviderReference;

  /**
   * The filename of the file, if available from the provider.
   */
  filename?: string;

  /**
   * The IANA media type of the file, if available from the provider.
   */
  mediaType?: string;

  /**
   * The size of the file in bytes, if available from the provider.
   */
  byteSize?: number;

  /**
   * When the file was created, if available from the provider.
   */
  createdAt?: Date;

  /**
   * When the provider will delete the file (retention expiry),
   * if available from the provider.
   */
  expiresAt?: Date;

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
