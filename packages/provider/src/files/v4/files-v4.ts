import type { FilesV4DeleteFileCallOptions } from './files-v4-delete-file-call-options';
import type { FilesV4DeleteFileResult } from './files-v4-delete-file-result';
import type { FilesV4DownloadFileCallOptions } from './files-v4-download-file-call-options';
import type { FilesV4DownloadFileResult } from './files-v4-download-file-result';
import type { FilesV4GetFileMetadataCallOptions } from './files-v4-get-file-metadata-call-options';
import type { FilesV4GetFileMetadataResult } from './files-v4-get-file-metadata-result';
import type { FilesV4UploadFileCallOptions } from './files-v4-upload-file-call-options';
import type { FilesV4UploadFileResult } from './files-v4-upload-file-result';

/**
 * Specification for a file management interface that implements the files interface version 4.
 *
 * Only `uploadFile` is required. The other operations are optional
 * capabilities: their presence signals that the provider supports them
 * (mirroring the optional-method pattern of `VideoModelV4`).
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

  /**
   * Retrieves metadata for a previously uploaded file.
   * Optional: presence signals that the provider supports metadata reads.
   */
  getFileMetadata?(
    options: FilesV4GetFileMetadataCallOptions,
  ): PromiseLike<FilesV4GetFileMetadataResult>;

  /**
   * Downloads the content of a previously uploaded file as a byte stream.
   * Optional: presence signals that the provider supports content download.
   */
  downloadFile?(
    options: FilesV4DownloadFileCallOptions,
  ): PromiseLike<FilesV4DownloadFileResult>;

  /**
   * Deletes a previously uploaded file.
   * Optional: presence signals that the provider supports deletion.
   */
  deleteFile?(
    options: FilesV4DeleteFileCallOptions,
  ): PromiseLike<FilesV4DeleteFileResult>;
};
