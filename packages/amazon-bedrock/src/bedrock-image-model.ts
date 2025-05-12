import { ImageModelV1, ImageModelV1CallWarning } from '@ai-sdk/provider';
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
  BedrockImageSettings,
  modelMaxImagesPerCall,
} from './bedrock-image-settings';
import { BedrockErrorSchema } from './bedrock-error';
import { z } from 'zod';

type BedrockImageModelConfig = {
  baseUrl: () => string;
  headers: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
};

/**
 * @see https://docs.aws.amazon.com/nova/latest/userguide/image-gen-req-resp-structure.html
 */
const BEDROCK_TASK_TYPES = [
  'TEXT_IMAGE',
  'INPAINTING',
  'COLOR_GUIDED_GENERATION',
  'IMAGE_VARIATION',
  'OUTPAINTING',
  'BACKGROUND_REMOVAL',
] as const;
type BedrockTaskType = (typeof BEDROCK_TASK_TYPES)[number];

export class BedrockImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'amazon-bedrock';

  get maxImagesPerCall(): number {
    return (
      this.settings.maxImagesPerCall ?? modelMaxImagesPerCall[this.modelId] ?? 1
    );
  }

  private getUrl(modelId: string): string {
    const encodedModelId = encodeURIComponent(modelId);
    return `${this.config.baseUrl()}/model/${encodedModelId}/invoke`;
  }

  constructor(
    readonly modelId: BedrockImageModelId,
    private readonly settings: BedrockImageSettings,
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
  }: Parameters<ImageModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV1['doGenerate']>>
  > {
    const warnings: Array<ImageModelV1CallWarning> = [];
    const [width, height] = size ? size.split('x').map(Number) : [];
    const imageGenerationConfig = {
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
    };
    const args = {
      ...getArgs(
        (providerOptions?.bedrock?.taskType || 'TEXT_IMAGE') as BedrockTaskType,
        prompt,
        providerOptions,
      ),
      imageGenerationConfig,
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

function getArgs(
  taskType: BedrockTaskType,
  prompt: string,
  providerOptions: Parameters<ImageModelV1['doGenerate']>[0]['providerOptions'],
) {
  switch (taskType) {
    case 'TEXT_IMAGE':
      return {
        taskType: 'TEXT_IMAGE',
        textToImageParams: {
          text: providerOptions?.bedrock?.text || prompt,
          ...(providerOptions?.bedrock?.negativeText
            ? {
                negativeText: providerOptions.bedrock.negativeText,
              }
            : {}),
          ...(providerOptions?.bedrock?.conditionImage
            ? { conditionImage: providerOptions.bedrock.conditionImage }
            : {}),
          ...(providerOptions?.bedrock?.controlMode
            ? { controlMode: providerOptions.bedrock.controlMode }
            : {}),
          ...(providerOptions?.bedrock?.controlStrength
            ? { controlStrength: providerOptions.bedrock.controlStrength }
            : {}),
        },
      };
    case 'COLOR_GUIDED_GENERATION':
      return {
        taskType: 'COLOR_GUIDED_GENERATION',
        colorGuidedGenerationParams: {
          text: providerOptions?.bedrock?.text || prompt,
          colors: providerOptions?.bedrock?.colors || [],
          ...(providerOptions?.bedrock?.referenceImage
            ? { referenceImage: providerOptions.bedrock.referenceImage }
            : {}),
          ...(providerOptions?.bedrock?.negativeText
            ? { negativeText: providerOptions.bedrock.negativeText }
            : {}),
        },
      };
    case 'IMAGE_VARIATION':
      return {
        taskType: 'IMAGE_VARIATION',
        imageVariationParams: {
          text: providerOptions?.bedrock?.text || prompt,
          images: providerOptions?.bedrock?.images || [],
          ...(providerOptions?.bedrock?.similarityStrength
            ? { similarityStrength: providerOptions.bedrock.similarityStrength }
            : {}),
          ...(providerOptions?.bedrock?.negativeText
            ? { negativeText: providerOptions.bedrock.negativeText }
            : {}),
        },
      };
    case 'INPAINTING':
      return {
        taskType: 'INPAINTING',
        inPaintingParams: {
          text: providerOptions?.bedrock?.text || prompt,
          image: providerOptions?.bedrock?.image || '',
          ...(providerOptions?.bedrock?.maskPrompt
            ? { maskPrompt: providerOptions.bedrock.maskPrompt }
            : {}),
          ...(providerOptions?.bedrock?.maskImage
            ? { maskImage: providerOptions.bedrock.maskImage }
            : {}),
          ...(providerOptions?.bedrock?.negativeText
            ? { negativeText: providerOptions.bedrock.negativeText }
            : {}),
        },
      };
    case 'OUTPAINTING':
      return {
        taskType: 'OUTPAINTING',
        outPaintingParams: {
          text: providerOptions?.bedrock?.text || prompt,
          image: providerOptions?.bedrock?.image || '',
          ...(providerOptions?.bedrock?.maskPrompt
            ? { maskPrompt: providerOptions.bedrock.maskPrompt }
            : {}),
          ...(providerOptions?.bedrock?.maskImage
            ? { maskImage: providerOptions.bedrock.maskImage }
            : {}),
          ...(providerOptions?.bedrock?.outPaintingMode
            ? { outPaintingMode: providerOptions.bedrock.outPaintingMode }
            : {}),
          ...(providerOptions?.bedrock?.negativeText
            ? { negativeText: providerOptions.bedrock.negativeText }
            : {}),
        },
      };
    case 'BACKGROUND_REMOVAL':
      return {
        taskType: 'BACKGROUND_REMOVAL',
        backgroundRemovalParams: {
          image: providerOptions?.bedrock?.image || '',
        },
      };
    default:
      taskType satisfies never;
      throw new Error(`Unsupported task type: ${taskType}`);
  }
}
