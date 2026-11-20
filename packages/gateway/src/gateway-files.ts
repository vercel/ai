import {
  APICallError,
  type FilesV4,
  type FilesV4DeleteFileCallOptions,
  type FilesV4DeleteFileResult,
  type FilesV4GetFileMetadataCallOptions,
  type FilesV4GetFileMetadataResult,
  type FilesV4UploadFileCallOptions,
  type FilesV4UploadFileResult,
  type SharedV4ProviderReference,
  type SharedV4Warning,
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
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';
import {
  GATEWAY_FILE_PART,
  gatewayFileDeleteResponseSchema,
  gatewayFileResponseSchema,
  getGatewayFileUploadFields,
  getGatewayFileUrl,
  getGatewayFilesUrl,
  getGatewayShouldRetry,
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
      filename,
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
                ...fields.map(field => ({ type: 'field' as const, ...field })),
                {
                  type: 'file',
                  name: GATEWAY_FILE_PART.name,
                  mediaType: GATEWAY_FILE_PART.mediaType,
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
              formData: toFormData({ fields, data }),
              failedResponseHandler,
              successfulResponseHandler,
              abortSignal,
              fetch: this.config.fetch,
            });

      const details = toGatewayFileDetails(response);
      const storedMediaType = details.mediaType ?? mediaType;
      const storedFilename = details.filename ?? filename;

      return {
        ...details,
        mediaType: storedMediaType,
        ...(storedFilename != null ? { filename: storedFilename } : {}),
        warnings: getMediaTypeWarnings({
          declared: mediaType,
          stored: details.mediaType,
        }),
      };
    } catch (error) {
      throw await toGatewayFilesError(error, resolvedHeaders);
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
      throw await toGatewayFilesError(error, resolvedHeaders);
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
      throw await toGatewayFilesError(error, resolvedHeaders);
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

async function toGatewayFilesError(
  error: unknown,
  resolvedHeaders: Record<string, string | undefined> | undefined,
) {
  return asGatewayError(error, await parseAuthMethod(resolvedHeaders ?? {}), {
    isRetryable: APICallError.isInstance(error)
      ? getGatewayShouldRetry(error.responseHeaders)
      : undefined,
  });
}

function getMediaTypeWarnings({
  declared,
  stored,
}: {
  declared: string;
  stored: string | undefined;
}): Array<SharedV4Warning> {
  if (
    stored == null ||
    declared === 'application/octet-stream' ||
    normalizeMediaType(declared) === normalizeMediaType(stored)
  ) {
    return [];
  }

  return [
    {
      type: 'other',
      message: `AI Gateway detected the file as '${stored}' instead of the declared '${declared}'.`,
    },
  ];
}

function normalizeMediaType(mediaType: string): string {
  return mediaType.split(';')[0].trim().toLowerCase();
}

function toFormData({
  fields,
  data,
}: {
  fields: Array<{ name: string; value: string }>;
  data: Exclude<FilesV4UploadFileCallOptions['data'], { type: 'stream' }>;
}): FormData {
  const formData = new FormData();
  for (const field of fields) {
    formData.append(field.name, field.value);
  }
  formData.append(
    GATEWAY_FILE_PART.name,
    new Blob(
      [convertInlineFileDataToUint8Array(data) as Uint8Array<ArrayBuffer>],
      { type: GATEWAY_FILE_PART.mediaType },
    ),
  );
  return formData;
}
