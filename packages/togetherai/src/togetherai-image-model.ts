import type { ImageModelV4, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertImageModelFileToDataUri,
  createJsonResponseHandler,
  createJsonErrorResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { togetheraiImageModelOptionsSchema } from './togetherai-image-model-options';
import type { TogetherAIImageModelId } from './togetherai-image-settings';
import { z } from 'zod/v4';

interface TogetherAIImageModelConfig {
  provider: string;
  baseURL: string;
  headers?: () => Record<string, string>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

const nonDiffusionImageModels = new Set<string>(['google/gemini-3-pro-image']);

export class TogetherAIImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxImagesPerCall = 1;

  get supportsFileInputs(): boolean | undefined {
    if (
      [
        'black-forest-labs/FLUX.1-kontext-pro',
        'black-forest-labs/FLUX.1-kontext-max',
        'black-forest-labs/FLUX.1-kontext-dev',
        'black-forest-labs/FLUX.1-canny',
        'black-forest-labs/FLUX.1-depth',
        'black-forest-labs/FLUX.1-redux',
        // These FLUX.2 models accept the single image_url sent by doGenerate.
        'black-forest-labs/FLUX.2-pro',
        'black-forest-labs/FLUX.2-flex',
      ].includes(this.modelId)
    ) {
      return true;
    }

    return [
      'stabilityai/stable-diffusion-xl-base-1.0',
      'black-forest-labs/FLUX.1-dev',
      'black-forest-labs/FLUX.1-dev-lora',
      'black-forest-labs/FLUX.1-schnell',
      'black-forest-labs/FLUX.1.1-pro',
      'black-forest-labs/FLUX.1-pro',
      'black-forest-labs/FLUX.1-schnell-Free',
      // These models require reference_images, which doGenerate does not send.
      'black-forest-labs/FLUX.2-dev',
      'google/gemini-3-pro-image',
    ].includes(this.modelId)
      ? false
      : undefined;
  }

  get supportsMaskInputs(): boolean | undefined {
    return this.supportsFileInputs == null ? undefined : false;
  }

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: TogetherAIImageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: TogetherAIImageModelId;
    config: TogetherAIImageModelConfig;
  }) {
    return new TogetherAIImageModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: TogetherAIImageModelId,
    private config: TogetherAIImageModelConfig,
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

    if (mask != null) {
      throw new Error(
        'Together AI does not support mask-based image editing. ' +
          'Use FLUX Kontext models (e.g., black-forest-labs/FLUX.1-kontext-pro) ' +
          'with a reference image and descriptive prompt instead.',
      );
    }

    if (aspectRatio != null) {
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
      schema: togetheraiImageModelOptionsSchema,
    });

    const isNonDiffusionModel = nonDiffusionImageModels.has(this.modelId);

    const modelOptions = { ...togetheraiOptions };
    if (isNonDiffusionModel) {
      delete modelOptions.steps;
      delete modelOptions.guidance;
      delete modelOptions.negative_prompt;
      delete modelOptions.disable_safety_checker;

      if (seed != null) {
        warnings.push({
          type: 'unsupported',
          feature: 'seed',
          details: `The ${this.modelId} model does not support the \`seed\` option.`,
        });
      }
    }

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
      headers: combineHeaders(this.config.headers?.(), headers),
      body: {
        model: this.modelId,
        prompt,
        ...(seed != null && !isNonDiffusionModel ? { seed } : {}),
        ...(n > 1 ? { n } : {}),
        ...(splitSize && {
          width: parseInt(splitSize[0]),
          height: parseInt(splitSize[1]),
        }),
        ...(imageUrl != null ? { image_url: imageUrl } : {}),
        response_format: 'base64',
        ...modelOptions,
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
