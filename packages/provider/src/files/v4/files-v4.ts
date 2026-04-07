import { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';
import { SharedV4ProviderReference } from '../../shared/v4/shared-v4-provider-reference';
import { SharedV4Warning } from '../../shared/v4/shared-v4-warning';

/**
 * Result of uploading a file via the files interface.
 */
export type FilesV4UploadFileResult = {
  /**
   * A provider reference mapping provider names to provider-specific file identifiers.
   */
  providerReference: SharedV4ProviderReference;

  /**
   * The IANA media type of the uploaded file, if available from the provider.
   */
  mediaType?: string;

  /**
   * The filename of the uploaded file, if available from the provider.
   */
  filename?: string;

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

/**
 * Options for uploading a file via the files interface.
 */
export type FilesV4UploadFileCallOptions = {
  /**
   * The file data as raw bytes or a base64-encoded string.
   */
  data: Uint8Array | string;

  /**
   * The IANA media type of the file (e.g. `'application/pdf'`).
   */
  mediaType: string;

  /**
   * The filename of the file.
   */
  filename?: string;

  /**
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: SharedV4ProviderOptions;
};

/**
 * Specification for a file management interface that implements the files interface version 4.
 */
export type FilesV4 = {
  /**
   * The files interface must specify which files interface version it implements.
   */
  readonly specificationVersion: 'v4';

  /**
   * Provider ID.
   */
  readonly provider: string;

  /**
   * Uploads a file to the provider and returns a provider reference
   * that can be used in subsequent API calls.
   */
  uploadFile(
    options: FilesV4UploadFileCallOptions,
  ): PromiseLike<FilesV4UploadFileResult>;
};
