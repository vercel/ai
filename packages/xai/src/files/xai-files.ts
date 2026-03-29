import { FilesV4, FilesV4UploadFileResult } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  FetchFunction,
  parseProviderOptions,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { xaiFailedResponseHandler } from '../xai-error';
import { xaiFilesResponseSchema } from './xai-files-api';
import { xaiFilesOptionsSchema, XaiFilesOptions } from './xai-files-options';

export function createXaiFiles({
  provider,
  baseURL,
  headers,
  fetch,
}: {
  provider: string;
  baseURL: string | undefined;
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
      const xaiOptions = (await parseProviderOptions({
        provider: 'xai',
        providerOptions,
        schema: xaiFilesOptionsSchema,
      })) as XaiFilesOptions | undefined;

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

      if (xaiOptions?.teamId != null) {
        formData.append('team_id', xaiOptions.teamId);
      }

      const { value: response } = await postFormDataToApi({
        url: `${baseURL}/files`,
        headers: combineHeaders(headers()),
        formData,
        failedResponseHandler: xaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          xaiFilesResponseSchema,
        ),
        fetch,
      });

      return {
        warnings: [],
        providerReference: { xai: response.id },
        ...((response.filename ?? filename)
          ? { filename: response.filename ?? filename }
          : {}),
        ...(mediaType != null ? { mediaType } : {}),
        providerMetadata: {
          xai: {
            ...(response.filename != null
              ? { filename: response.filename }
              : {}),
            ...(response.bytes != null ? { bytes: response.bytes } : {}),
            ...(response.created_at != null
              ? { createdAt: response.created_at }
              : {}),
          },
        },
      };
    },
  };
}
