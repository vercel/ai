import type {
  FilesV4,
  FilesV4DeleteFileCallOptions,
  FilesV4DeleteFileResult,
  FilesV4GetFileMetadataCallOptions,
  FilesV4GetFileMetadataResult,
  FilesV4UploadFileCallOptions,
  FilesV4UploadFileResult,
  SharedV4ProviderReference,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertInlineFileDataToUint8Array,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  deleteFromApi,
  getErrorMessage,
  getFromApi,
  parseProviderOptions,
  postFormDataToApi,
  postMultipartStreamToApi,
  resolve,
  resolveProviderReference,
  type MultipartStreamPart,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';
import {
  GATEWAY_FILE_FIELD,
  gatewayFileDeleteResponseSchema,
  gatewayFileResponseSchema,
  getGatewayFileUploadFields,
  getGatewayFileUrl,
  getGatewayFilesUrl,
  toGatewayFileDetails,
} from './gateway-files-api';
import {
  gatewayFilesOptionsSchema,
  type GatewayFilesOptions,
} from './gateway-files-options';

const failedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: z.any(),
  errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
});

export class GatewayFiles implements FilesV4 {
  readonly specificationVersion = 'v4';

  constructor(
    private readonly config: GatewayConfig & {
      provider: string;
      o11yHeaders: Resolvable<Record<string, string>>;
    },
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  async uploadFile({
    data,
    mediaType,
    filename,
    abortSignal,
    headers,
    providerOptions,
  }: FilesV4UploadFileCallOptions): Promise<FilesV4UploadFileResult> {
    let gatewayOptions: GatewayFilesOptions | undefined;
    let resolvedHeaders: Record<string, string | undefined> | undefined;
    try {
      gatewayOptions = await parseProviderOptions({
        provider: 'gateway',
        providerOptions,
        schema: gatewayFilesOptionsSchema,
      });
      resolvedHeaders = await this.resolveHeaders();
    } catch (error) {
      // rejected before any request: release the caller's stream
      if (data.type === 'stream') {
        await data.stream.cancel(error).catch(() => {});
      }
      throw error;
    }

    const url = getGatewayFilesUrl(this.config.baseURL);
    const requestHeaders = await this.getRequestHeaders(
      resolvedHeaders,
      headers,
    );
    const fields = getGatewayFileUploadFields({
      expiresAfter: gatewayOptions?.expiresAfter,
    });
    const successfulResponseHandler = createJsonResponseHandler(
      gatewayFileResponseSchema,
    );

    try {
      const { value: response } =
        data.type === 'stream'
          ? await postMultipartStreamToApi({
              url,
              headers: requestHeaders,
              parts: [
                ...fields.map(
                  (field): MultipartStreamPart => ({ type: 'field', ...field }),
                ),
                {
                  type: 'file',
                  name: GATEWAY_FILE_FIELD,
                  filename,
                  mediaType,
                  content: data.stream,
                },
              ],
              failedResponseHandler,
              successfulResponseHandler,
              abortSignal,
              fetch: this.config.fetch,
            })
          : await postFormDataToApi({
              url,
              headers: requestHeaders,
              formData: toFormData({ fields, data, mediaType, filename }),
              failedResponseHandler,
              successfulResponseHandler,
              abortSignal,
              fetch: this.config.fetch,
            });

      const details = toGatewayFileDetails(response);
      return {
        warnings: [],
        mediaType,
        ...(filename != null ? { filename } : {}),
        ...details,
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  async getFileMetadata({
    file,
    abortSignal,
    headers,
  }: FilesV4GetFileMetadataCallOptions): Promise<FilesV4GetFileMetadataResult> {
    const fileId = getGatewayFileId(file);
    const resolvedHeaders = await this.resolveHeaders();

    try {
      const { value: response } = await getFromApi({
        url: getGatewayFileUrl(this.config.baseURL, fileId),
        headers: await this.getRequestHeaders(resolvedHeaders, headers),
        failedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          gatewayFileResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
        validateUrl: false,
      });

      return { warnings: [], ...toGatewayFileDetails(response) };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  async deleteFile({
    file,
    abortSignal,
    headers,
  }: FilesV4DeleteFileCallOptions): Promise<FilesV4DeleteFileResult> {
    const fileId = getGatewayFileId(file);
    const resolvedHeaders = await this.resolveHeaders();

    try {
      const { value: response } = await deleteFromApi({
        url: getGatewayFileUrl(this.config.baseURL, fileId),
        headers: await this.getRequestHeaders(resolvedHeaders, headers),
        failedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          gatewayFileDeleteResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      });

      return {
        warnings: [],
        providerReference: { gateway: response.id },
        deleted: response.deleted,
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  private async resolveHeaders() {
    return this.config.headers ? await resolve(this.config.headers) : undefined;
  }

  private async getRequestHeaders(
    resolvedHeaders: Record<string, string | undefined> | undefined,
    headers: Record<string, string | undefined> | undefined,
  ) {
    return combineHeaders(
      resolvedHeaders,
      headers,
      await resolve(this.config.o11yHeaders),
    );
  }
}

function getGatewayFileId(file: SharedV4ProviderReference): string {
  return resolveProviderReference({ reference: file, provider: 'gateway' });
}

function toFormData({
  fields,
  data,
  mediaType,
  filename,
}: {
  fields: Array<{ name: string; value: string }>;
  data: Exclude<FilesV4UploadFileCallOptions['data'], { type: 'stream' }>;
  mediaType: string;
  filename: string | undefined;
}): FormData {
  const formData = new FormData();
  for (const field of fields) {
    formData.append(field.name, field.value);
  }

  const blob = new Blob(
    [convertInlineFileDataToUint8Array(data) as Uint8Array<ArrayBuffer>],
    { type: mediaType },
  );
  if (filename != null) {
    formData.append(GATEWAY_FILE_FIELD, blob, filename);
  } else {
    formData.append(GATEWAY_FILE_FIELD, blob);
  }

  return formData;
}
