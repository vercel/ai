import {
  APICallError,
  type FilesV4,
  type FilesV4UploadFileCallOptions,
  type FilesV4UploadFileResult,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertInlineFileDataToUint8Array,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  lazySchema,
  postFormDataToApi,
  postMultipartStreamToApi,
  resolve,
  zodSchema,
  type FetchFunction,
  type InferSchema,
  type MultipartStreamPart,
  type Resolvable,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';

export type GatewayFilesConfig = {
  provider: string;
  /** URL of the files collection; uploads are posted to it. */
  filesURL: string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  o11yHeaders: Resolvable<Record<string, string>>;
};

const GATEWAY_FILE_PURPOSE = 'user_data';

export class GatewayFiles implements FilesV4 {
  readonly specificationVersion = 'v4';

  constructor(private readonly config: GatewayFilesConfig) {}

  get provider(): string {
    return this.config.provider;
  }

  async uploadFile({
    data,
    mediaType,
    filename,
    abortSignal,
    headers,
  }: FilesV4UploadFileCallOptions): Promise<FilesV4UploadFileResult> {
    let resolvedHeaders: Record<string, string | undefined>;
    try {
      resolvedHeaders = await resolve(this.config.headers);
    } catch (error) {
      // rejected before any request: release the caller's stream
      if (data.type === 'stream') {
        await data.stream.cancel(error).catch(() => {});
      }
      throw error;
    }

    const requestHeaders = combineHeaders(
      resolvedHeaders,
      headers,
      await resolve(this.config.o11yHeaders),
    );
    const url = this.config.filesURL;

    try {
      let response: GatewayFileResponse;

      if (data.type === 'stream') {
        const parts: Array<MultipartStreamPart> = [
          { type: 'field', name: 'purpose', value: GATEWAY_FILE_PURPOSE },
          {
            type: 'file',
            name: 'file',
            filename,
            mediaType,
            content: data.stream,
          },
        ];

        ({ value: response } = await postMultipartStreamToApi({
          url,
          headers: requestHeaders,
          parts,
          failedResponseHandler: gatewayFilesFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            gatewayFileResponseSchema,
          ),
          abortSignal,
          fetch: this.config.fetch,
        }));
      } else {
        const blob = new Blob(
          [convertInlineFileDataToUint8Array(data) as Uint8Array<ArrayBuffer>],
          { type: mediaType },
        );

        const formData = new FormData();
        formData.append('purpose', GATEWAY_FILE_PURPOSE);
        if (filename != null) {
          formData.append('file', blob, filename);
        } else {
          formData.append('file', blob);
        }

        ({ value: response } = await postFormDataToApi({
          url,
          headers: requestHeaders,
          formData,
          failedResponseHandler: gatewayFilesFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            gatewayFileResponseSchema,
          ),
          abortSignal,
          fetch: this.config.fetch,
        }));
      }

      const responseFilename = response.filename ?? filename;

      return {
        warnings: [],
        providerReference: { gateway: response.id },
        mediaType,
        ...(responseFilename != null ? { filename: responseFilename } : {}),
        ...(response.bytes != null ? { byteSize: response.bytes } : {}),
        ...(response.created_at != null
          ? { createdAt: new Date(response.created_at * 1000) }
          : {}),
        ...(response.expires_at != null
          ? { expiresAt: new Date(response.expires_at * 1000) }
          : {}),
        providerMetadata: { gateway: toFileMetadata(response) },
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }
}

const gatewayFileResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      bytes: z.nullish(z.number()),
      created_at: z.nullish(z.number()),
      expires_at: z.nullish(z.number()),
      filename: z.nullish(z.string()),
      purpose: z.nullish(z.string()),
      status: z.nullish(z.string()),
    }),
  ),
);

type GatewayFileResponse = InferSchema<typeof gatewayFileResponseSchema>;

function toFileMetadata(
  response: GatewayFileResponse,
): Record<string, string | number> {
  return {
    ...(response.filename != null ? { filename: response.filename } : {}),
    ...(response.purpose != null ? { purpose: response.purpose } : {}),
    ...(response.bytes != null ? { bytes: response.bytes } : {}),
    ...(response.created_at != null ? { createdAt: response.created_at } : {}),
    ...(response.status != null ? { status: response.status } : {}),
    ...(response.expires_at != null ? { expiresAt: response.expires_at } : {}),
  };
}

const jsonErrorResponseHandler = createJsonErrorResponseHandler({
  errorSchema: z.any(),
  errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
});

// The files API reports OpenAI-style types (`invalid_request_error` for every
// 4xx, `server_error` for 5xx), so the gateway error class follows the status.
const gatewayFilesFailedResponseHandler: ResponseHandler<
  APICallError
> = async options => {
  const result = await jsonErrorResponseHandler(options);
  const error = result.value;
  const body = error.data as { error?: { type?: unknown } } | undefined;
  const type = body?.error?.type;

  if (
    error.statusCode == null ||
    body?.error == null ||
    (type != null &&
      type !== 'invalid_request_error' &&
      type !== 'server_error')
  ) {
    return result;
  }

  return {
    ...result,
    value: new APICallError({
      message: error.message,
      url: error.url,
      requestBodyValues: error.requestBodyValues,
      statusCode: error.statusCode,
      responseHeaders: error.responseHeaders,
      responseBody: error.responseBody,
      cause: error.cause,
      isRetryable: error.isRetryable,
      data: {
        ...body,
        error: {
          ...body.error,
          type: toGatewayErrorType(error.statusCode),
        },
      },
    }),
  };
};

function toGatewayErrorType(statusCode: number): string {
  switch (statusCode) {
    case 401:
      return 'authentication_error';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 429:
      return 'rate_limit_exceeded';
    default:
      return statusCode >= 500
        ? 'internal_server_error'
        : 'invalid_request_error';
  }
}
