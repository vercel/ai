import { LanguageModelV4DataContent } from '../../language-model/v4/language-model-v4-data-content';
import { SharedV4ProviderMetadata } from '../../shared/v4/shared-v4-provider-metadata';
import { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';
import { SharedV4ProviderReference } from '../../shared/v4/shared-v4-provider-reference';

/**
 * Result of uploading a file via the files interface.
 */
export type FilesV4UploadFileResult = {
  /**
   * A provider reference mapping provider names to provider-specific file identifiers.
   */
  providerReference: SharedV4ProviderReference;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerMetadata?: SharedV4ProviderMetadata;
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
  uploadFile(options: {
    data: LanguageModelV4DataContent;
    providerOptions?: SharedV4ProviderOptions;
  }): PromiseLike<FilesV4UploadFileResult>;
};
