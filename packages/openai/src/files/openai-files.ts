import { FilesV4, FilesV4UploadFileResult } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { openaiFailedResponseHandler } from '../openai-error';
import { openaiFilesResponseSchema } from './openai-files-api';
import {
  openaiFilesOptionsSchema,
  OpenAIFilesOptions,
} from './openai-files-options';

export function createOpenAIFiles({
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
      const openaiOptions = (await parseProviderOptions({
        provider: 'openai',
        providerOptions,
        schema: openaiFilesOptionsSchema,
      })) as OpenAIFilesOptions | undefined;

      const fileBytes =
        data instanceof Uint8Array ? data : convertBase64ToUint8Array(data);

      const blob = new Blob([fileBytes], {
        type: mediaType ?? 'application/octet-stream',
      });

      const formData = new FormData();
      if (filename != null) {
        formData.append('file', blob, filename);
      } else {
        formData.append('file', blob);
      }
      formData.append('purpose', openaiOptions?.purpose ?? 'assistants');

      if (openaiOptions?.expiresAfter != null) {
        formData.append('expires_after', String(openaiOptions.expiresAfter));
      }

      const { value: response } = await postFormDataToApi({
        url: `${baseURL}/files`,
        headers: combineHeaders(headers()),
        formData,
        failedResponseHandler: openaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          openaiFilesResponseSchema,
        ),
        fetch,
      });

      return {
        warnings: [],
        providerReference: { openai: response.id },
        providerMetadata: {
          openai: {
            ...(response.filename != null
              ? { filename: response.filename }
              : {}),
            ...(response.purpose != null ? { purpose: response.purpose } : {}),
            ...(response.bytes != null ? { bytes: response.bytes } : {}),
            ...(response.created_at != null
              ? { createdAt: response.created_at }
              : {}),
            ...(response.status != null ? { status: response.status } : {}),
            ...(response.expires_at != null
              ? { expiresAt: response.expires_at }
              : {}),
          },
        },
      };
    },
  };
}
