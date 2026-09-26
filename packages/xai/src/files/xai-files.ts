import {
  InvalidArgumentError,
  type FilesV4,
  type FilesV4DeleteFileCallOptions,
  type FilesV4DeleteFileResult,
  type FilesV4DownloadFileCallOptions,
  type FilesV4DownloadFileResult,
  type FilesV4GetFileMetadataCallOptions,
  type FilesV4GetFileMetadataResult,
  type FilesV4UploadFileCallOptions,
  type FilesV4UploadFileResult,
  type SharedV4ProviderReference,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertInlineFileDataToUint8Array,
  createBinaryStreamResponseHandler,
  createJsonResponseHandler,
  deleteFromApi,
  getFromApi,
  parseProviderOptions,
  postFormDataToApi,
  postMultipartStreamToApi,
  type FetchFunction,
  type InferSchema,
  type MultipartStreamPart,
} from '@ai-sdk/provider-utils';
import { xaiFailedResponseHandler } from '../xai-error';
import {
  xaiFileDeleteResponseSchema,
  xaiFilesResponseSchema,
} from './xai-files-api';
import {
  xaiFilesOptionsSchema,
  type XaiFilesOptions,
} from './xai-files-options';

interface XaiFilesConfig {
  provider: string;
  baseURL: string | undefined;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}

type XaiFilesResponse = InferSchema<typeof xaiFilesResponseSchema>;

function encodePathSegment(value: string): string {
  const encodedValue = encodeURIComponent(value);

  // URL parsing normalizes both literal and percent-encoded dot segments.
  return encodedValue === '.'
    ? '%252E'
    : encodedValue === '..'
      ? '%252E%252E'
      : encodedValue;
}

export class XaiFiles implements FilesV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: XaiFilesConfig) {}

  private getFileId(file: SharedV4ProviderReference): string {
    const fileId = file.xai;
    if (fileId == null || fileId.trim() === '') {
      throw new InvalidArgumentError({
        argument: 'file',
        message: "file reference is missing an 'xai' file id.",
      });
    }
    return fileId;
  }

  private getHeaders(
    headers: Record<string, string | undefined> | undefined,
  ): Record<string, string | undefined> {
    return combineHeaders(this.config.headers(), headers);
  }

  async uploadFile({
    data,
    mediaType,
    filename,
    abortSignal,
    headers,
    providerOptions,
  }: FilesV4UploadFileCallOptions): Promise<FilesV4UploadFileResult> {
    let xaiOptions: XaiFilesOptions | undefined;
    try {
      xaiOptions = (await parseProviderOptions({
        provider: 'xai',
        providerOptions,
        schema: xaiFilesOptionsSchema,
      })) as XaiFilesOptions | undefined;
    } catch (error) {
      // rejected before any request: release the caller's stream
      if (data.type === 'stream') {
        await data.stream.cancel(error).catch(() => {});
      }
      throw error;
    }

    const requestHeaders = this.getHeaders(headers);
    const url = `${this.config.baseURL}/files`;

    let response: XaiFilesResponse;

    if (data.type === 'stream') {
      // xAI rejects uploads where expires_after arrives after the file part,
      // so all fields precede the file.
      const parts: Array<MultipartStreamPart> = [];

      if (xaiOptions?.expiresAfter != null) {
        parts.push({
          type: 'field',
          name: 'expires_after',
          value: String(xaiOptions.expiresAfter),
        });
      }

      if (xaiOptions?.teamId != null) {
        parts.push({
          type: 'field',
          name: 'team_id',
          value: xaiOptions.teamId,
        });
      }

      parts.push({
        type: 'file',
        name: 'file',
        filename,
        mediaType,
        content: data.stream,
      });

      ({ value: response } = await postMultipartStreamToApi({
        url,
        headers: requestHeaders,
        parts,
        failedResponseHandler: xaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          xaiFilesResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      }));
    } else {
      const fileBytes = convertInlineFileDataToUint8Array(data);

      const blob = new Blob([fileBytes], {
        type: mediaType,
      });

      // FormData serializes in append order; expires_after must precede file.
      const formData = new FormData();

      if (xaiOptions?.expiresAfter != null) {
        formData.append('expires_after', String(xaiOptions.expiresAfter));
      }

      if (xaiOptions?.teamId != null) {
        formData.append('team_id', xaiOptions.teamId);
      }

      if (filename != null) {
        formData.append('file', blob, filename);
      } else {
        formData.append('file', blob);
      }

      ({ value: response } = await postFormDataToApi({
        url,
        headers: requestHeaders,
        formData,
        failedResponseHandler: xaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          xaiFilesResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      }));
    }

    return {
      warnings: [],
      providerReference: { xai: response.id },
      ...((response.filename ?? filename)
        ? { filename: response.filename ?? filename }
        : {}),
      ...(mediaType != null ? { mediaType } : {}),
      ...(response.bytes != null ? { byteSize: response.bytes } : {}),
      ...(response.created_at != null
        ? { createdAt: new Date(response.created_at * 1000) }
        : {}),
      ...(response.expires_at != null
        ? { expiresAt: new Date(response.expires_at * 1000) }
        : {}),
      providerMetadata: {
        xai: this.toFileMetadata(response),
      },
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
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiFilesResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
      validateUrl: false,
    });

    return {
      warnings: [],
      providerReference: { xai: response.id },
      ...(response.filename != null ? { filename: response.filename } : {}),
      ...(response.bytes != null ? { byteSize: response.bytes } : {}),
      ...(response.created_at != null
        ? { createdAt: new Date(response.created_at * 1000) }
        : {}),
      ...(response.expires_at != null
        ? { expiresAt: new Date(response.expires_at * 1000) }
        : {}),
      providerMetadata: {
        xai: this.toFileMetadata(response),
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
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createBinaryStreamResponseHandler(),
      abortSignal,
      fetch: this.config.fetch,
      validateUrl: false,
    });

    // media type from the content endpoint's Content-Type, without parameters
    const mediaType = responseHeaders?.['content-type']?.split(';')[0].trim();

    return {
      warnings: [],
      content,
      ...(mediaType ? { mediaType } : {}),
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
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiFileDeleteResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      providerReference: { xai: response.id },
      deleted: response.deleted,
    };
  }

  private toFileMetadata(
    response: XaiFilesResponse,
  ): Record<string, string | number> {
    return {
      ...(response.filename != null ? { filename: response.filename } : {}),
      ...(response.purpose != null ? { purpose: response.purpose } : {}),
      ...(response.bytes != null ? { bytes: response.bytes } : {}),
      ...(response.created_at != null
        ? { createdAt: response.created_at }
        : {}),
      ...(response.status != null ? { status: response.status } : {}),
      ...(response.expires_at != null
        ? { expiresAt: response.expires_at }
        : {}),
    };
  }
}
