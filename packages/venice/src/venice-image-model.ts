import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { VeniceAIConfig } from './venice-config';
import { veniceFailedResponseHandler } from './venice-error';
import {
  VeniceAIImageModelId,
  VeniceAIImageSettings,
  modelMaxImagesPerCall,
} from './venice-image-settings';

export class VeniceAIImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get maxImagesPerCall(): number {
    return (
      this.settings.maxImagesPerCall ?? modelMaxImagesPerCall[this.modelId] ?? 1
    );
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: VeniceAIImageModelId,
    private readonly settings: VeniceAIImageSettings,
    private readonly config: VeniceAIConfig,
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

    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use height and width instead.',
      });
    }

    if (size != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details:
          'This model does not support size. Use height and width instead.',
      });
    }

    const veniceParams = {
      ...(this.settings.venice_parameters ?? {}),
      ...(providerOptions.venice ?? {}),
    };

    if (seed != null && veniceParams.seed == null) {
      veniceParams.seed = seed;
    }

    const { value: response } = await postJsonToApi({
      url: this.config.url({
        path: '/image/generate',
        model: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        prompt,
        ...veniceParams,
      },
      failedResponseHandler: veniceFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        veniceImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.data.flatMap(item => item.images),
      warnings,
    };
  }
}

// venice image response schema
const veniceImageResponseSchema = z.object({
  data: z.array(z.object({ images: z.array(z.string()) })),
});
