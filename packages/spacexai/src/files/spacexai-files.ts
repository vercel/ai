import type {
  FilesV4,
  FilesV4UploadFileCallOptions,
  FilesV4UploadFileResult,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertInlineFileDataToUint8Array,
  createJsonResponseHandler,
  postFormDataToApi,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { spacexaiFailedResponseHandler } from '../spacexai-error';
import { spacexaiFilesResponseSchema } from './spacexai-files-api';
import {
  spacexaiFilesOptionsSchema,
  type SpaceXAIFilesOptions,
} from './spacexai-files-options';
import {
  parseSpaceXAIProviderOptions,
  spacexaiProviderMetadata,
  spacexaiProviderReference,
} from '../spacexai-provider-options';
interface SpaceXAIFilesConfig {
  provider: string;
  baseURL: string | undefined;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}

export class SpaceXAIFiles implements FilesV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: SpaceXAIFilesConfig) {}

  async uploadFile({
    data,
    mediaType,
    filename,
    providerOptions,
  }: FilesV4UploadFileCallOptions): Promise<FilesV4UploadFileResult> {
    const spacexaiOptions = (await parseSpaceXAIProviderOptions({
      providerOptions,
      schema: spacexaiFilesOptionsSchema,
    })) as SpaceXAIFilesOptions | undefined;

    const fileBytes = convertInlineFileDataToUint8Array(data);

    const blob = new Blob([new Uint8Array(fileBytes)], {
      type: mediaType,
    });

    const formData = new FormData();
    if (filename != null) {
      formData.append('file', blob, filename);
    } else {
      formData.append('file', blob);
    }

    if (spacexaiOptions?.teamId != null) {
      formData.append('team_id', spacexaiOptions.teamId);
    }

    const { value: response } = await postFormDataToApi({
      url: `${this.config.baseURL}/files`,
      headers: combineHeaders(this.config.headers()),
      formData,
      failedResponseHandler: spacexaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        spacexaiFilesResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      providerReference: spacexaiProviderReference(response.id),
      ...((response.filename ?? filename)
        ? { filename: response.filename ?? filename }
        : {}),
      ...(mediaType != null ? { mediaType } : {}),
      providerMetadata: spacexaiProviderMetadata({
        ...(response.filename != null ? { filename: response.filename } : {}),
        ...(response.bytes != null ? { bytes: response.bytes } : {}),
        ...(response.created_at != null
          ? { createdAt: response.created_at }
          : {}),
      }),
    };
  }
}
