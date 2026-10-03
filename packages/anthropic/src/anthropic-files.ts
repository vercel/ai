import type {
  FilesV4,
  FilesV4UploadFileCallOptions,
  FilesV4UploadFileResult,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertInlineFileDataToUint8Array,
  createJsonResponseHandler,
  lazySchema,
  postFormDataToApi,
  zodSchema,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { anthropicFailedResponseHandler } from './anthropic-error';
import type { AnthropicHeaders } from './anthropic-language-model-options';
import { fromAnthropicHeaders } from './util/from-anthropic-headers';

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

interface AnthropicFilesConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<AnthropicHeaders>;
  fetch?: FetchFunction;
}

export class AnthropicFiles implements FilesV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  constructor(private readonly config: AnthropicFilesConfig) {}

  private async getHeaders(
    headers?: AnthropicHeaders,
  ): Promise<Record<string, string | undefined>> {
    const resolvedHeaders = await resolve(this.config.headers);
    return combineHeaders(
      fromAnthropicHeaders(resolvedHeaders),
      {
        'anthropic-beta': 'files-api-2025-04-14',
      },
      fromAnthropicHeaders(headers),
    );
  }

  async uploadFile({
    data,
    mediaType,
    filename,
    abortSignal,
    headers,
  }: FilesV4UploadFileCallOptions): Promise<FilesV4UploadFileResult> {
    const fileBytes = convertInlineFileDataToUint8Array(data);

    const blob = new Blob([fileBytes], { type: mediaType });

    const formData = new FormData();
    if (filename != null) {
      formData.append('file', blob, filename);
    } else {
      formData.append('file', blob);
    }

    const resolvedHeaders = await this.getHeaders(headers);
    const { value: response } = await postFormDataToApi({
      url: `${this.config.baseURL}/files`,
      headers: resolvedHeaders,
      formData,
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicUploadFileResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      warnings: [],
      providerReference: { anthropic: response.id },
      mediaType: response.mime_type ?? mediaType,
      filename: response.filename ?? filename,
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
  }
}
