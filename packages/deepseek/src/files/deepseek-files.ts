import type {
  FilesV4,
  FilesV4UploadFileCallOptions,
  FilesV4UploadFileResult,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertInlineFileDataToUint8Array,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postFormDataToApi,
  type FetchFunction,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { deepSeekErrorSchema } from '../chat/deepseek-chat-api-types';
import { deepSeekFilesResponseSchema } from './deepseek-files-api';
import {
  deepSeekFilesOptionsSchema,
  type DeepSeekFilesOptions,
} from './deepseek-files-options';

interface DeepSeekFilesConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
}

const deepSeekFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: deepSeekErrorSchema,
  errorToMessage: (error: InferSchema<typeof deepSeekErrorSchema>) =>
    error.error.message,
});

export class DeepSeekFiles implements FilesV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: DeepSeekFilesConfig) {}

  async uploadFile({
    data,
    mediaType,
    filename,
    providerOptions,
  }: FilesV4UploadFileCallOptions): Promise<FilesV4UploadFileResult> {
    const deepSeekOptions = (await parseProviderOptions({
      provider: 'deepseek',
      providerOptions,
      schema: deepSeekFilesOptionsSchema,
    })) as DeepSeekFilesOptions | undefined;

    const fileBytes = convertInlineFileDataToUint8Array(data);
    const blob = new Blob([fileBytes], { type: mediaType });

    const formData = new FormData();
    if (filename != null) {
      formData.append('file', blob, filename);
    } else {
      formData.append('file', blob);
    }
    formData.append('purpose', 'user_data');

    if (deepSeekOptions?.expiresAfter != null) {
      formData.append('expires_after[anchor]', 'created_at');
      formData.append(
        'expires_after[seconds]',
        String(deepSeekOptions.expiresAfter),
      );
    }

    const { value: response } = await postFormDataToApi({
      url: `${this.config.baseURL}/files`,
      headers: combineHeaders(this.config.headers()),
      formData,
      failedResponseHandler: deepSeekFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        deepSeekFilesResponseSchema,
      ),
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      providerReference: { deepseek: response.id },
      ...((response.filename ?? filename)
        ? { filename: response.filename ?? filename }
        : {}),
      ...(mediaType != null ? { mediaType } : {}),
      providerMetadata: {
        deepseek: {
          ...(response.object != null ? { object: response.object } : {}),
          ...(response.filename != null ? { filename: response.filename } : {}),
          ...(response.purpose != null ? { purpose: response.purpose } : {}),
          ...(response.bytes != null ? { bytes: response.bytes } : {}),
          ...(response.created_at != null
            ? { createdAt: response.created_at }
            : {}),
          ...(response.expires_at != null
            ? { expiresAt: response.expires_at }
            : {}),
        },
      },
    };
  }
}
