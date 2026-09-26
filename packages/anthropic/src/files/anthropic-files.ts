import {
  InvalidArgumentError,
  type FilesV4,
  type FilesV4DeleteFileCallOptions,
  type FilesV4DeleteFileResult,
  type FilesV4UploadFileCallOptions,
  type FilesV4UploadFileResult,
  type SharedV4ProviderReference,
  type FilesV4DownloadFileCallOptions,
  type FilesV4DownloadFileResult,
  type FilesV4GetFileMetadataCallOptions,
  type FilesV4GetFileMetadataResult,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertInlineFileDataToUint8Array,
  createBinaryStreamResponseHandler,
  createJsonResponseHandler,
  deleteFromApi,
  getFromApi,
  postFormDataToApi,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { anthropicFailedResponseHandler } from '../anthropic-error';
import {
  anthropicDeleteFileResponseSchema,
  anthropicUploadFileResponseSchema,
} from './anthropic-files-api';

interface AnthropicFilesConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}

function encodePathSegment(value: string): string {
  const encodedValue = encodeURIComponent(value);

  // URL parsing normalizes both literal and percent-encoded dot segments.
  return encodedValue === '.'
    ? '%252E'
    : encodedValue === '..'
      ? '%252E%252E'
      : encodedValue;
}

export class AnthropicFiles implements FilesV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: AnthropicFilesConfig) {}

  private getFileId(file: SharedV4ProviderReference): string {
    const fileId = file.anthropic;
    if (fileId == null || fileId.trim() === '') {
      throw new InvalidArgumentError({
        argument: 'file',
        message: "file reference is missing an 'anthropic' file id.",
      });
    }
    return fileId;
  }

  private getHeaders(
    headers: Record<string, string | undefined> | undefined,
  ): Record<string, string | undefined> {
    return combineHeaders(
      this.config.headers(),
      { 'anthropic-beta': 'files-api-2025-04-14' },
      headers,
    );
  }

  async uploadFile({
    data,
    mediaType,
    filename,
    abortSignal,
    headers,
  }: FilesV4UploadFileCallOptions): Promise<FilesV4UploadFileResult> {
    const fileBytes = convertInlineFileDataToUint8Array(data);

    const blob = new Blob([fileBytes], { type: mediaType });

    const formData = new FormData();
    if (filename != null) {
      formData.append('file', blob, filename);
    } else {
      formData.append('file', blob);
    }

    const { value: response } = await postFormDataToApi({
      url: `${this.config.baseURL}/files`,
      headers: this.getHeaders(headers),
      formData,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicUploadFileResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      providerReference: { anthropic: response.id },
      mediaType: response.mime_type ?? mediaType,
      filename: response.filename ?? filename,
      providerMetadata: {
        anthropic: {
          filename: response.filename,
          mimeType: response.mime_type,
          sizeBytes: response.size_bytes,
          createdAt: response.created_at,
          ...(response.downloadable != null
            ? { downloadable: response.downloadable }
            : {}),
        },
      },
    };
  }

  async deleteFile({
    file,
    abortSignal,
    headers,
  }: FilesV4DeleteFileCallOptions): Promise<FilesV4DeleteFileResult> {
    const fileId = this.getFileId(file);
    const { value: response } = await deleteFromApi({
      url: `${this.config.baseURL}/files/${encodePathSegment(fileId)}`,
      headers: this.getHeaders(headers),
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicDeleteFileResponseSchema,
      ),
    });
    return {
      warnings: [],
      providerReference: { anthropic: response.id },
      deleted: response.type === 'file_deleted',
    };
  }

  async getFileMetadata({
    file,
    abortSignal,
    headers,
  }: FilesV4GetFileMetadataCallOptions): Promise<FilesV4GetFileMetadataResult> {
    const fileId = this.getFileId(file);
    const { value: response } = await getFromApi({
      url: `${this.config.baseURL}/files/${encodePathSegment(fileId)}`,
      headers: this.getHeaders(headers),
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicUploadFileResponseSchema,
      ),
      validateUrl: false,
    });

    return {
      warnings: [],
      providerReference: { anthropic: response.id },
      filename: response.filename,
      byteSize: response.size_bytes,
      createdAt:
        response.created_at != null ? new Date(response.created_at) : undefined,
      providerMetadata: {
        anthropic: response,
      },
    };
  }

  async downloadFile({
    file,
    abortSignal,
    headers,
  }: FilesV4DownloadFileCallOptions): Promise<FilesV4DownloadFileResult> {
    const fileId = this.getFileId(file);
    const { value: content, responseHeaders } = await getFromApi({
      url: `${this.config.baseURL}/files/${encodePathSegment(fileId)}/content`,
      headers: this.getHeaders(headers),
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createBinaryStreamResponseHandler(),
      validateUrl: false,
    });

    const mediaType = responseHeaders?.['content-type']?.split(';')[0].trim();

    return {
      warnings: [],
      content,
      mediaType,
    };
  }
}
