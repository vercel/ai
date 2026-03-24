import { FilesV4 } from '@ai-sdk/provider';
import { DataContent, ProviderOptions } from '@ai-sdk/provider-utils';
import { convertToLanguageModelV4DataContent } from '../prompt/data-content';
import { ProviderMetadata } from '../types/provider-metadata';
import { ProviderReference } from '../types/provider-reference';
import { UploadFileResult } from './upload-file-result';

/**
 * Uploads a file using a files interface.
 *
 * @param files - The FilesV4 interface to use for uploading.
 * @param data - The file data to upload. Can be a DataContent value or a URL.
 * @param providerOptions - Additional provider-specific options.
 *
 * @returns A result object containing the provider reference and optional metadata.
 */
export async function uploadFile({
  files,
  data: dataArg,
  providerOptions,
}: {
  /**
   * The files interface to use for uploading.
   */
  files: FilesV4;

  /**
   * The file data to upload.
   */
  data: DataContent | URL;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: ProviderOptions;
}): Promise<UploadFileResult> {
  const { data } = convertToLanguageModelV4DataContent(dataArg);

  const result = await files.uploadFile({
    data,
    providerOptions: providerOptions ?? {},
  });

  return new DefaultUploadFileResult({
    providerReference: result.providerReference,
    providerMetadata: result.providerMetadata,
  });
}

class DefaultUploadFileResult implements UploadFileResult {
  readonly providerReference: ProviderReference;
  readonly providerMetadata?: ProviderMetadata;

  constructor(options: {
    providerReference: ProviderReference;
    providerMetadata?: ProviderMetadata;
  }) {
    this.providerReference = options.providerReference;
    this.providerMetadata = options.providerMetadata;
  }
}
