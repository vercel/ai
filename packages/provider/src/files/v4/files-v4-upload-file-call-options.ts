import { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';

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
