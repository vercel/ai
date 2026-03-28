import { FilesV4, FilesV4UploadFileResult } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  FetchFunction,
  lazySchema,
  parseProviderOptions,
  postFormDataToApi,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { anthropicFailedResponseHandler } from './anthropic-error';

const anthropicUploadFileProviderOptions = z.object({});

const anthropicUploadFileResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      type: z.literal('file'),
      filename: z.string(),
      mime_type: z.string(),
      size_bytes: z.number(),
      created_at: z.string(),
      downloadable: z.boolean().nullish(),
    }),
  ),
);

export function createAnthropicFiles({
  provider,
  baseURL,
  headers,
  fetch,
}: {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}): FilesV4 {
  return {
    specificationVersion: 'v4',
    provider,

    async uploadFile({
      data,
      mediaType,
      filename,
      providerOptions,
    }): Promise<FilesV4UploadFileResult> {
      const anthropicOptions = await parseProviderOptions({
        provider: 'anthropic',
        providerOptions,
        schema: zodSchema(anthropicUploadFileProviderOptions),
      });

      const fileBytes =
        data instanceof Uint8Array ? data : convertBase64ToUint8Array(data);

      const resolvedMediaType = mediaType ?? 'application/octet-stream';

      const blob = new Blob([fileBytes], { type: resolvedMediaType });

      const formData = new FormData();
      if (filename != null) {
        formData.append('file', blob, filename);
      } else {
        formData.append('file', blob);
      }

      const { value: response } = await postFormDataToApi({
        url: `${baseURL}/files`,
        headers: combineHeaders(headers(), {
          'anthropic-beta': 'files-api-2025-04-14',
        }),
        formData,
        failedResponseHandler: anthropicFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          anthropicUploadFileResponseSchema,
        ),
        fetch,
      });

      return {
        warnings: [],
        providerReference: { anthropic: response.id },
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
    },
  };
}
