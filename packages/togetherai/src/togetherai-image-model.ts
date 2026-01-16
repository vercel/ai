import { ImageModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createJsonResponseHandler,
  createJsonErrorResponseHandler,
  FetchFunction,
  InferSchema,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { TogetherAIImageModelId } from './togetherai-image-settings';
import { z } from 'zod/v4';

interface TogetherAIImageModelConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class TogetherAIImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly maxImagesPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: TogetherAIImageModelId,
    private config: TogetherAIImageModelConfig,
  ) {}

  async doGenerate({
    prompt,
    n,
    size,
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

    if (mask != null) {
      throw new Error(
        'Together AI does not support mask-based image editing. ' +
          'Use FLUX Kontext models (e.g., black-forest-labs/FLUX.1-kontext-pro) ' +
          'with a reference image and descriptive prompt instead.',
      );
    }

    if (size != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details:
          'This model does not support the `aspectRatio` option. Use `size` instead.',
      });
    }

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const togetheraiOptions = await parseProviderOptions({
      provider: 'togetherai',
      providerOptions,
      schema: togetheraiImageProviderOptionsSchema,
    });

    // Handle image input from files
    let imageUrl: string | undefined;
    if (files != null && files.length > 0) {
      imageUrl = convertImageModelFileToDataUri(files[0]);

      if (files.length > 1) {
        warnings.push({
          type: 'other',
          message:
            'Together AI only supports a single input image. Additional images are ignored.',
        });
      }
    }

    const splitSize = size?.split('x');
    // https://docs.together.ai/reference/post_images-generations
    const { value: response, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/images/generations`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        model: this.modelId,
        prompt,
        seed,
        n,
        ...(splitSize && {
          width: parseInt(splitSize[0]),
          height: parseInt(splitSize[1]),
        }),
        ...(imageUrl != null ? { image_url: imageUrl } : {}),
        response_format: 'base64',
        ...(togetheraiOptions ?? {}),
      },
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: togetheraiErrorSchema,
        errorToMessage: data => data.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        togetheraiImageResponseSchema,
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

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const togetheraiImageResponseSchema = z.object({
  data: z.array(
    z.object({
      b64_json: z.string(),
    }),
  ),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const togetheraiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
  }),
});

/**
 * Provider options schema for Together AI image generation.
 */
export const togetheraiImageProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        /**
         * Number of generation steps. Higher values can improve quality.
         */
        steps: z.number().nullish(),

        /**
         * Guidance scale for image generation.
         */
        guidance: z.number().nullish(),

        /**
         * Negative prompt to guide what to avoid.
         */
        negative_prompt: z.string().nullish(),

        /**
         * Disable the safety checker for image generation.
         * When true, the API will not reject images flagged as potentially NSFW.
         * Not available for Flux Schnell Free and Flux Pro models.
         */
        disable_safety_checker: z.boolean().nullish(),
      })
      .passthrough(),
  ),
);

export type TogetherAIImageProviderOptions = InferSchema<
  typeof togetheraiImageProviderOptionsSchema
>;
