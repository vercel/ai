import { ImageModelV2, ImageModelV2CallWarning } from '@ai-sdk/provider';
import {
  FetchFunction,
  Resolvable,
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
} from '@ai-sdk/provider-utils';
import {
  BedrockImageModelId,
  modelMaxImagesPerCall,
} from './bedrock-image-settings';
import { BedrockErrorSchema } from './bedrock-error';
import { z } from 'zod/v4';

type BedrockImageModelConfig = {
  baseUrl: () => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

export class BedrockImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
  readonly provider = 'amazon-bedrock';

  get maxImagesPerCall(): number {
    return modelMaxImagesPerCall[this.modelId] ?? 1;
  }

  private getUrl(modelId: string): string {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}/invoke`;
  }

  constructor(
    readonly modelId: BedrockImageModelId,
    private readonly config: BedrockImageModelConfig,
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
  }: Parameters<ImageModelV2['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV2['doGenerate']>>
  > {
    const warnings: Array<ImageModelV2CallWarning> = [];
    const [width, height] = size ? size.split('x').map(Number) : [];
    const args = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: prompt,
        ...(providerOptions?.bedrock?.negativeText
          ? {
              negativeText: providerOptions.bedrock.negativeText,
            }
          : {}),
        ...(providerOptions?.bedrock?.style
          ? {
              style: providerOptions.bedrock.style,
            }
          : {}),
      },
      imageGenerationConfig: {
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(seed ? { seed } : {}),
        ...(n ? { numberOfImages: n } : {}),
        ...(providerOptions?.bedrock?.quality
          ? { quality: providerOptions.bedrock.quality }
          : {}),
        ...(providerOptions?.bedrock?.cfgScale
          ? { cfgScale: providerOptions.bedrock.cfgScale }
          : {}),
      },
    };

    if (aspectRatio != undefined) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'This model does not support aspect ratio. Use `size` instead.',
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: response, responseHeaders } = await postJsonToApi({
      url: this.getUrl(this.modelId),
      headers: await resolve(
        combineHeaders(await resolve(this.config.headers), headers),
      ),
      body: args,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: BedrockErrorSchema,
        errorToMessage: error => `${error.type}: ${error.message}`,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        bedrockImageResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      images: response.images,
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
const bedrockImageResponseSchema = z.object({
  images: z.array(z.string()),
});
