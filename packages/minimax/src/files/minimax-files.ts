import {
  InvalidArgumentError,
  type FilesV4,
  type FilesV4DeleteFileCallOptions,
  type FilesV4DeleteFileResult,
  type FilesV4UploadFileCallOptions,
  type FilesV4UploadFileResult,
  type SharedV4ProviderReference,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  resolve,
  combineHeaders,
  convertInlineFileDataToUint8Array,
  createJsonResponseHandler,
  postFormDataToApi,
  createJsonErrorResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { minimaxErrorResponseSchema } from '../minimax-error';
import {
  minimaxFilesDeleteResponseSchema,
  minimaxFilesResponseSchema,
} from './minimax-files-api';
import { minimaxFilesProviderOptionsSchema } from './minimax-files-options';

interface MiniMaxFilesConfig {
  provider: string;
  baseURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
}

export class MiniMaxFiles implements FilesV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  private async getHeaders(
    headers?: Record<string, string | undefined>,
  ): Promise<Record<string, string | undefined>> {
    return combineHeaders(await resolve(this.config.headers), headers);
  }

  private getFileId(file: SharedV4ProviderReference): string {
    const fileId = file.minimax;
    if (fileId == null || fileId.trim() === '') {
      throw new InvalidArgumentError({
        argument: 'file',
        message: "file reference is missing an 'minimax' file id.",
      });
    }
    return fileId;
  }

  constructor(private readonly config: MiniMaxFilesConfig) {}

  async uploadFile({
    data,
    mediaType,
    filename,
    abortSignal,
    headers,
    providerOptions,
  }: FilesV4UploadFileCallOptions): Promise<FilesV4UploadFileResult> {
    const warnings: SharedV4Warning[] = [];
    const resolvedHeaders = await this.getHeaders(headers);
    const fileBytes = convertInlineFileDataToUint8Array(data);
    const minimaxOptions = await parseProviderOptions({
      provider: 'minimax',
      schema: minimaxFilesProviderOptionsSchema,
      providerOptions,
    });

    const blob = new Blob([fileBytes], { type: mediaType });

    const formData = new FormData();
    if (filename != null) {
      formData.append('file', blob, filename);
    } else {
      formData.append('file', blob);
    }

    if (minimaxOptions?.purpose != null) {
      formData.append('purpose', minimaxOptions.purpose);
    } else {
      formData.append('purpose', 't2a_async_input');
    }

    const { value: response } = await postFormDataToApi({
      url: `${this.config.baseURL}/v1/files/upload`,
      headers: resolvedHeaders,
      abortSignal,
      fetch: this.config.fetch,
      formData,
      successfulResponseHandler: createJsonResponseHandler(
        minimaxFilesResponseSchema,
      ),
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: minimaxErrorResponseSchema,
        errorToMessage: error => error.error.message,
      }),
    });

    return {
      warnings,
      providerReference: { minimax: response.file.file_id.toString() },
      filename: response.file.filename ?? filename,
      createdAt: new Date(response.file.created_at * 1000),
      byteSize: response.file.bytes ?? fileBytes.byteLength,
      providerMetadata: {
        minimax: {
          filename: response.file.filename,
          createdAt: response.file.created_at,
          bytes: response.file.bytes,
          purpose: response.file.purpose,
        },
      },
    };
  }

  async deleteFile({
    file,
    headers,
    abortSignal,
    providerOptions,
  }: FilesV4DeleteFileCallOptions): Promise<FilesV4DeleteFileResult> {
    const fileId = this.getFileId(file);
    const resolvedHeaders = await this.getHeaders(headers);
    const minimaxOptions = await parseProviderOptions({
      provider: 'minimax',
      schema: minimaxFilesProviderOptionsSchema,
      providerOptions,
    });

    const { value: response } = await postJsonToApi({
      url: `${this.config.baseURL}/v1/files/delete`,
      headers: resolvedHeaders,
      abortSignal,
      fetch: this.config.fetch,
      body: {
        file_id: fileId,
        purpose: minimaxOptions?.purpose ?? 't2a_async_input',
      },
      successfulResponseHandler: createJsonResponseHandler(
        minimaxFilesDeleteResponseSchema,
      ),
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: minimaxErrorResponseSchema,
        errorToMessage: error => error.error.message,
      }),
    });

    return {
      warnings: [],
      deleted: response.file_id === Number(fileId),
      providerReference: { minimax: response.file_id.toString() },
    };
  }
}
