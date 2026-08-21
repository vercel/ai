import type { ImageModelV4, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  getFromApi,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { spacexaiFailedResponseHandler } from './spacexai-error';
import { spacexaiImageModelOptions } from './spacexai-image-model-options';
import type { SpaceXAIImageModelId } from './spacexai-image-settings';
import {
  parseSpaceXAIProviderOptions,
  spacexaiProviderMetadata,
} from './spacexai-provider-options';

interface SpaceXAIImageModelConfig {
  provider: string;
  baseURL: string | undefined;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class SpaceXAIImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall = 3;

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: SpaceXAIImageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: SpaceXAIImageModelId;
    config: SpaceXAIImageModelConfig;
  }) {
    return new SpaceXAIImageModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: SpaceXAIImageModelId,
    private config: SpaceXAIImageModelConfig,
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
  }: Parameters<ImageModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV4['doGenerate']>>
  > {
    const warnings: Array<SharedV4Warning> = [];

    if (size != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'seed',
      });
    }

    if (mask != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
      });
    }

    const spacexaiOptions = await parseSpaceXAIProviderOptions({
      providerOptions,
      schema: spacexaiImageModelOptions,
    });

    const hasFiles = files != null && files.length > 0;
    const imageUrls = hasFiles
      ? files.map(file => convertImageModelFileToDataUri(file))
      : [];

    const endpoint = hasFiles ? '/images/edits' : '/images/generations';

    const body: Record<string, unknown> = {
      model: this.modelId,
      prompt,
      n,
      response_format: 'b64_json',
    };

    if (aspectRatio != null) {
      body.aspect_ratio = aspectRatio;
    }

    if (spacexaiOptions?.output_format != null) {
      body.output_format = spacexaiOptions.output_format;
    }

    if (spacexaiOptions?.sync_mode != null) {
      body.sync_mode = spacexaiOptions.sync_mode;
    }

    if (spacexaiOptions?.aspect_ratio != null && aspectRatio == null) {
      body.aspect_ratio = spacexaiOptions.aspect_ratio;
    }

    if (spacexaiOptions?.resolution != null) {
      body.resolution = spacexaiOptions.resolution;
    }

    if (spacexaiOptions?.quality != null) {
      body.quality = spacexaiOptions.quality;
    }

    if (spacexaiOptions?.user != null) {
      body.user = spacexaiOptions.user;
    }

    if (imageUrls.length === 1) {
      body.image = { url: imageUrls[0], type: 'image_url' };
    } else if (imageUrls.length > 1) {
      body.images = imageUrls.map(url => ({ url, type: 'image_url' }));
    }

    const baseURL = this.config.baseURL ?? 'https://api.x.ai/v1';
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${baseURL}${endpoint}`,
      headers: combineHeaders(this.config.headers?.(), headers),
      body,
      failedResponseHandler: spacexaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        spacexaiImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    if (response.data.some(image => image.respect_moderation === false)) {
      throw new Error(
        'Image generation was blocked due to a content policy violation.',
      );
    }

    const hasAllBase64 = response.data.every(image => image.b64_json != null);

    const images = hasAllBase64
      ? response.data.map(image => image.b64_json!)
      : await Promise.all(
          response.data.map(image =>
            this.downloadImage(image.url!, abortSignal),
          ),
        );

    return {
      images,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: spacexaiProviderMetadata({
        images: response.data.map(item => ({
          ...(item.revised_prompt
            ? { revisedPrompt: item.revised_prompt }
            : {}),
        })),
        ...(response.usage?.cost_in_usd_ticks != null
          ? { costInUsdTicks: response.usage.cost_in_usd_ticks }
          : {}),
      }),
    };
  }

  private async downloadImage(
    url: string,
    abortSignal: AbortSignal | undefined,
  ): Promise<Uint8Array> {
    const { value } = await getFromApi({
      url,
      // url is a generated-image URL from the provider response; validate it.
      validateUrl: true,
      trustedOrigin: this.config.baseURL,
      abortSignal,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createBinaryResponseHandler(),
      fetch: this.config.fetch,
    });
    return value;
  }
}

const spacexaiImageResponseSchema = z.object({
  data: z.array(
    z.object({
      url: z.string().nullish(),
      b64_json: z.string().nullish(),
      revised_prompt: z.string().nullish(),
      respect_moderation: z.boolean().nullish(),
    }),
  ),
  usage: z
    .object({
      cost_in_usd_ticks: z.number().nullish(),
    })
    .nullish(),
});
