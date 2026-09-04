import type { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';
import type { SharedV4ProviderReference } from '../../shared/v4/shared-v4-provider-reference';

/**
 * Options for downloading file content via the files interface.
 */
export type FilesV4DownloadFileCallOptions = {
  /**
   * The provider reference of the file, as returned by `uploadFile`.
   */
  file: SharedV4ProviderReference;

  /**
   * Abort signal for cancelling the operation.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;

  /**
   * Additional provider-specific options. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: SharedV4ProviderOptions;
};
