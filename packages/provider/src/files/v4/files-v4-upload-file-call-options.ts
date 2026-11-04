import type {
  SharedV4FileDataData,
  SharedV4FileDataText,
} from '../../shared/v4/shared-v4-file-data';
import type { SharedV4ProviderOptions } from '../../shared/v4/shared-v4-provider-options';

/**
 * File data variant containing a byte stream. Providers that support
 * streaming uploads send it without buffering the full file in memory.
 */
export interface FilesV4UploadFileStreamData {
  type: 'stream';
  stream: ReadableStream<Uint8Array>;
}

/**
 * Options for uploading a file via the files interface.
 */
export type FilesV4UploadFileCallOptions = {
  /**
   * The file data.
   *
   * - `{ type: 'data', data }`: raw bytes (`Uint8Array`) or a base64-encoded string.
   * - `{ type: 'text', text }`: inline text (UTF-8).
   * - `{ type: 'stream', stream }`: a byte stream (not buffered by providers
   *   that support streaming uploads).
   */
  data:
    | SharedV4FileDataData
    | SharedV4FileDataText
    | FilesV4UploadFileStreamData;

  /**
   * The IANA media type of the file (e.g. `'application/pdf'`).
   */
  mediaType: string;

  /**
   * The filename of the file.
   */
  filename?: string;

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
