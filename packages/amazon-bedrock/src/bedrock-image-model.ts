import {
  ImageModelV3,
  ImageModelV3File,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  Resolvable,
  combineHeaders,
  convertUint8ArrayToBase64,
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

export class BedrockImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
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
    files,
    mask,
  }: Parameters<ImageModelV3['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV3['doGenerate']>>
  > {
    const warnings: Array<SharedV3Warning> = [];
    const [width, height] = size ? size.split('x').map(Number) : [];

    const hasFiles = files != null && files.length > 0;

    // Build image generation config (common to most modes)
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

    let args: Record<string, unknown>;

    if (hasFiles) {
      // Check if mask is actually provided (has valid data, not just an empty object)
      const hasMask = mask?.type != null;
      const hasMaskPrompt = providerOptions?.bedrock?.maskPrompt != null;

      // Determine task type from provider options, or infer from mask presence
      const taskType =
        providerOptions?.bedrock?.taskType ??
        (hasMask || hasMaskPrompt ? 'INPAINTING' : 'IMAGE_VARIATION');

      const sourceImageBase64 = getBase64Data(files[0]);

      switch (taskType) {
        case 'INPAINTING': {
          const inPaintingParams: Record<string, unknown> = {
            image: sourceImageBase64,
            ...(prompt ? { text: prompt } : {}),
            ...(providerOptions?.bedrock?.negativeText
              ? { negativeText: providerOptions.bedrock.negativeText }
              : {}),
          };

          // Handle mask - can be either a maskImage or maskPrompt
          if (hasMask) {
            inPaintingParams.maskImage = getBase64Data(mask);
          } else if (hasMaskPrompt) {
            inPaintingParams.maskPrompt = providerOptions.bedrock.maskPrompt;
          }

          args = {
            taskType: 'INPAINTING',
            inPaintingParams,
            imageGenerationConfig,
          };
          break;
        }

        case 'OUTPAINTING': {
          const outPaintingParams: Record<string, unknown> = {
            image: sourceImageBase64,
            ...(prompt ? { text: prompt } : {}),
            ...(providerOptions?.bedrock?.negativeText
              ? { negativeText: providerOptions.bedrock.negativeText }
              : {}),
            ...(providerOptions?.bedrock?.outPaintingMode
              ? { outPaintingMode: providerOptions.bedrock.outPaintingMode }
              : {}),
          };

          // Outpainting requires a maskImage (white pixels = area to change)
          if (hasMask) {
            outPaintingParams.maskImage = getBase64Data(mask);
          } else if (hasMaskPrompt) {
            outPaintingParams.maskPrompt = providerOptions.bedrock.maskPrompt;
          }

          args = {
            taskType: 'OUTPAINTING',
            outPaintingParams,
            imageGenerationConfig,
          };
          break;
        }

        case 'BACKGROUND_REMOVAL': {
          // Background removal only needs the image, no other params
          args = {
            taskType: 'BACKGROUND_REMOVAL',
            backgroundRemovalParams: {
              image: sourceImageBase64,
            },
          };
          break;
        }

        case 'IMAGE_VARIATION': {
          // Image variation can use multiple images
          const images = files.map(file => getBase64Data(file));

          const imageVariationParams: Record<string, unknown> = {
            images,
            ...(prompt ? { text: prompt } : {}),
            ...(providerOptions?.bedrock?.negativeText
              ? { negativeText: providerOptions.bedrock.negativeText }
              : {}),
            ...(providerOptions?.bedrock?.similarityStrength != null
              ? {
                  similarityStrength:
                    providerOptions.bedrock.similarityStrength,
                }
              : {}),
          };

          args = {
            taskType: 'IMAGE_VARIATION',
            imageVariationParams,
            imageGenerationConfig,
          };
          break;
        }

        default:
          throw new Error(`Unsupported task type: ${taskType}`);
      }
    } else {
      // Standard image generation mode
      args = {
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
        imageGenerationConfig,
      };
    }

    if (aspectRatio != undefined) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
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

    // Handle moderated/blocked requests
    if (response.status === 'Request Moderated') {
      const moderationReasons = response.details?.['Moderation Reasons'];
      const reasons = Array.isArray(moderationReasons)
        ? moderationReasons
        : ['Unknown'];
      throw new Error(
        `Amazon Bedrock request was moderated: ${reasons.join(', ')}`,
      );
    }

    // Check if images are present
    if (!response.images || response.images.length === 0) {
      throw new Error(
        'Amazon Bedrock returned no images. ' +
          (response.status ? `Status: ${response.status}` : ''),
      );
    }

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

function getBase64Data(file: ImageModelV3File): string {
  if (file.type === 'url') {
    throw new Error(
      'URL-based images are not supported for Amazon Bedrock image editing. ' +
        'Please provide the image data directly.',
    );
  }

  if (file.data instanceof Uint8Array) {
    return convertUint8ArrayToBase64(file.data);
  }

  // Already base64 string
  return file.data;
}

// minimal version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const bedrockImageResponseSchema = z.object({
  // Normal successful response
  images: z.array(z.string()).optional(),

  // Moderation response fields
  id: z.string().optional(),
  status: z.string().optional(),
  result: z.unknown().optional(),
  progress: z.unknown().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  preview: z.unknown().optional(),
});
