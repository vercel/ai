import {
  ImageModelV3,
  ImageModelV3File,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  convertToFormData,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  downloadBlob,
  FetchFunction,
  postFormDataToApi,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  defaultOpenAICompatibleErrorStructure,
  ProviderErrorStructure,
} from '../openai-compatible-error';
import { OpenAICompatibleImageModelId } from './openai-compatible-image-settings';

export type OpenAICompatibleImageModelConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
  errorStructure?: ProviderErrorStructure<any>;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class OpenAICompatibleImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 10;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAICompatibleImageModelId,
    private readonly config: OpenAICompatibleImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
    files,
    mask,
  }: Parameters<ImageModelV3['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV3['doGenerate']>>
  > {
    const warnings: Array<SharedV3Warning> = [];

    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      });
    }

    if (seed != null) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    // Image editing mode - use form data and /images/edits endpoint
    if (files != null && files.length > 0) {
      const { value: response, responseHeaders } = await postFormDataToApi({
        url: this.config.url({
          path: '/images/edits',
          modelId: this.modelId,
        }),
        headers: combineHeaders(this.config.headers(), headers),
        formData: convertToFormData<OpenAICompatibleFormDataInput>({
          model: this.modelId,
          prompt,
          image: await Promise.all(files.map(file => fileToBlob(file))),
          mask: mask != null ? await fileToBlob(mask) : undefined,
          n,
          size,
          ...(providerOptions.openai ?? {}),
        }),
        failedResponseHandler: createJsonErrorResponseHandler(
          this.config.errorStructure ?? defaultOpenAICompatibleErrorStructure,
        ),
        successfulResponseHandler: createJsonResponseHandler(
          openaiCompatibleImageResponseSchema,
        ),
        abortSignal,
        fetch: this.config.fetch,
      });

      return {
        images: response.data.map(item => item.b64_json),
        warnings,
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    // Standard image generation mode - use JSON and /images/generations endpoint
    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.config.url({
        path: '/images/generations',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        prompt,
        n,
        size,
        ...(providerOptions.openai ?? {}),
        response_format: 'b64_json',
      },
      failedResponseHandler: createJsonErrorResponseHandler(
        this.config.errorStructure ?? defaultOpenAICompatibleErrorStructure,
      ),
      successfulResponseHandler: createJsonResponseHandler(
        openaiCompatibleImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.map(item => item.b64_json),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiCompatibleImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string() })),
});

type OpenAICompatibleFormDataInput = {
  model: string;
  prompt: string | undefined;
  image: Blob | Blob[];
  mask?: Blob;
  n: number;
  size: `${number}x${number}` | undefined;
  [key: string]: unknown;
};

async function fileToBlob(file: ImageModelV3File): Promise<Blob> {
  if (file.type === 'url') {
    return downloadBlob(file.url);
  }

  const data =
    file.data instanceof Uint8Array
      ? file.data
      : convertBase64ToUint8Array(file.data);

  return new Blob([data as BlobPart], { type: file.mediaType });
}
