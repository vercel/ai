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
  gatewayFileDeleteResponseSchema,
  gatewayFileResponseSchema,
  getGatewayFileUploadBody,
  getGatewayFileUrl,
  getGatewayFilesUrl,
  getGatewayShouldRetry,
  toGatewayFileDeleteResult,
  toGatewayFileDetails,
} from './gateway-files-api';
import { gatewayFilesOptionsSchema } from './gateway-files-options';

const failedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: z.any(),
  errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
});

type GatewayFilesRequestHeaders = {
  resolvedHeaders: Record<string, string | undefined> | undefined;
  requestHeaders: Record<string, string | undefined>;
};

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
    let requestHeaders: GatewayFilesRequestHeaders;
    let body: ReturnType<typeof getGatewayFileUploadBody>;
    try {
      const gatewayOptions = await parseProviderOptions({
        provider: 'gateway',
        providerOptions,
        schema: gatewayFilesOptionsSchema,
      });
      requestHeaders = await this.getRequestHeaders(headers);
      body = getGatewayFileUploadBody({
        data,
        filename,
        expiresAfter: gatewayOptions?.expiresAfter,
      });
    } catch (error) {
      // rejected before any request: release the caller's stream
      if (data.type === 'stream') {
        await data.stream.cancel(error).catch(() => {});
      }
      throw error;
    }

    const url = getGatewayFilesUrl(this.config.baseURL);
    const successfulResponseHandler = createJsonResponseHandler(
      gatewayFileResponseSchema,
    );

    try {
      const { value: response } =
        body.type === 'stream'
          ? await postMultipartStreamToApi({
              url,
              headers: requestHeaders.requestHeaders,
              parts: body.parts,
              failedResponseHandler,
              successfulResponseHandler,
              abortSignal,
              fetch: this.config.fetch,
            })
          : await postFormDataToApi({
              url,
              headers: requestHeaders.requestHeaders,
              formData: body.formData,
              failedResponseHandler,
              successfulResponseHandler,
              abortSignal,
              fetch: this.config.fetch,
            });

      const details = toGatewayFileDetails(response);
      const storedFilename = details.filename ?? filename;

      return {
        ...details,
        mediaType: details.mediaType ?? mediaType,
        ...(storedFilename != null ? { filename: storedFilename } : {}),
        warnings: getMediaTypeWarnings({
          declared: mediaType,
          stored: details.mediaType,
        }),
      };
    } catch (error) {
      throw await toGatewayFilesError({ error, requestHeaders, abortSignal });
    }
  }

  async getFileMetadata({
    file,
    abortSignal,
    headers,
  }: FilesV4GetFileMetadataCallOptions): Promise<FilesV4GetFileMetadataResult> {
    const fileId = getGatewayFileId(file);
    const requestHeaders = await this.getRequestHeaders(headers);

    try {
      const { value: response } = await getFromApi({
        url: getGatewayFileUrl(this.config.baseURL, fileId),
        headers: requestHeaders.requestHeaders,
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
      throw await toGatewayFilesError({ error, requestHeaders, abortSignal });
    }
  }

  async deleteFile({
    file,
    abortSignal,
    headers,
  }: FilesV4DeleteFileCallOptions): Promise<FilesV4DeleteFileResult> {
    const fileId = getGatewayFileId(file);
    const requestHeaders = await this.getRequestHeaders(headers);

    try {
      const { value: response } = await deleteFromApi({
        url: getGatewayFileUrl(this.config.baseURL, fileId),
        headers: requestHeaders.requestHeaders,
        failedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          gatewayFileDeleteResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      });

      return { warnings: [], ...toGatewayFileDeleteResult(response) };
    } catch (error) {
      throw await toGatewayFilesError({ error, requestHeaders, abortSignal });
    }
  }

  private async getRequestHeaders(
    headers: Record<string, string | undefined> | undefined,
  ): Promise<GatewayFilesRequestHeaders> {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    return {
      resolvedHeaders,
      requestHeaders: combineHeaders(
        resolvedHeaders,
        headers,
        await resolve(this.config.o11yHeaders),
      ),
    };
  }
}

function getGatewayFileId(file: SharedV4ProviderReference): string {
  return resolveProviderReference({ reference: file, provider: 'gateway' });
}

async function toGatewayFilesError({
  error,
  requestHeaders,
  abortSignal,
}: {
  error: unknown;
  requestHeaders: GatewayFilesRequestHeaders;
  abortSignal: AbortSignal | undefined;
}): Promise<unknown> {
  // caller cancellation, whatever its reason, is not a gateway failure
  if (abortSignal?.aborted) {
    return error;
  }

  return asGatewayError(
    error,
    await parseAuthMethod(requestHeaders.resolvedHeaders ?? {}),
    {
      isRetryable: APICallError.isInstance(error)
        ? getGatewayShouldRetry(error.responseHeaders)
        : undefined,
    },
  );
}

function getMediaTypeWarnings({
  declared,
  stored,
}: {
  declared: string;
  stored: string | undefined;
}): Array<SharedV4Warning> {
  const normalizedDeclared = normalizeMediaType(declared);
  if (
    stored == null ||
    normalizedDeclared === 'application/octet-stream' ||
    normalizedDeclared === normalizeMediaType(stored)
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
