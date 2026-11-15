import type { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import type { SharedV4ProviderReference } from '../../shared/v4/shared-v4-provider-reference';
import type { SharedV4Warning } from '../../shared/v4/shared-v4-warning';

/**
 * Result of deleting a file via the files interface.
 */
export type FilesV4DeleteFileResult = {
  /**
   * A provider reference mapping provider names to provider-specific file identifiers.
   * Contains only the operated provider's entry — when working with a merged
   * multi-provider reference, do not reassign it with this result.
   */
  providerReference: SharedV4ProviderReference;

  /**
   * Whether the provider confirmed the deletion.
   */
  deleted: boolean;

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
