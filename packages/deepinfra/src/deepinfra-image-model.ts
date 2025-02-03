import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import {
  FetchFunction,
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import {
  DeepInfraImageModelId,
  DeepInfraImageSettings,
} from './deepinfra-image-settings';
import { z } from 'zod';

interface DeepInfraImageModelConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class DeepInfraImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 1;
  }

  constructor(
    readonly modelId: DeepInfraImageModelId,
    readonly settings: DeepInfraImageSettings,
    private config: DeepInfraImageModelConfig,
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
  }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    const warnings: Array<ImageModelV1CallWarning> = [];

    // Some deepinfra models support size while others support aspect ratio.
    // Allow passing either and leave it up to the server to validate.

    const splitSize = size?.split('x');
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/${this.modelId}`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        prompt,
        num_images: n,
        ...(aspectRatio && { aspect_ratio: aspectRatio }),
        ...(splitSize && { width: splitSize[0], height: splitSize[1] }),
        ...(seed != null && { seed }),
        ...(providerOptions.deepinfra ?? {}),
      },
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: deepInfraErrorSchema,
        errorToMessage: error => error.detail.error,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        deepInfraImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.images.map(image =>
        image.replace(/^data:image\/\w+;base64,/, ''),
      ),
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

export const deepInfraErrorSchema = z.object({
  detail: z.object({
    error: z.string(),
  }),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
export const deepInfraImageResponseSchema = z.object({
  images: z.array(z.string()),
});
