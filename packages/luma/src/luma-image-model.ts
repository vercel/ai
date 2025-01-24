import {
  APICallError,
  ImageModelV1,
  ImageModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  combineHeaders,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  createJsonErrorResponseHandler,
  createStatusCodeErrorResponseHandler,
  getFromApi,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';

interface LumaImageModelConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class LumaImageModel implements ImageModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  get maxImagesPerCall(): number {
    return this.settings.maxImagesPerCall ?? 1;
  }

  constructor(
    readonly modelId: string,
    private readonly settings: any,
    private config: LumaImageModelConfig,
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

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
        details: 'This model does not support the `seed` option.',
      });
    }

    if (size != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details:
          'This model does not support the `size` option. Use `aspectRatio` instead.',
      });
    }

    // Step 1: Send request to generate image
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: generationResponse, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/dream-machine/v1/generations/image`,
      headers: combineHeaders(this.config.headers(), headers),
      body: {
        prompt,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        model: this.modelId,
        ...(providerOptions.luma ?? {}),
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: createJsonErrorResponseHandler({
        errorSchema: lumaErrorResponseSchema,
        errorToMessage: (error: LumaErrorResponse) => error.error.message,
      }),
      successfulResponseHandler: createJsonResponseHandler(
        lumaGenerationResponseSchema,
      ),
    });

    console.log(
      'generationResponse',
      JSON.stringify(generationResponse, null, 2),
    );

    // Step 2: Poll for generation status
    const generationId = generationResponse.id;
    console.log('generationId', generationId);
    const imageResponse = await this.pollForImage(generationId, abortSignal);

    // Step 3: Download the image
    console.log('imageResponse', JSON.stringify(imageResponse, null, 2));
    // TODO: Handle case where image is not available.
    const downloadedImage = await this.downloadImage(
      imageResponse.assets?.image ?? '',
    );

    return {
      images: [downloadedImage],
      warnings,
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        // TODO: Include add'l headers from polling/downloading.
        headers: responseHeaders,
      },
    };
  }

  private async pollForImage(
    generationId: string,
    abortSignal: AbortSignal | undefined,
  ): Promise<LumaGenerationResponse> {
    const checkInterval = 5000;
    let attempts = 0;

    while (attempts < 12) {
      console.log('polling for image', generationId);
      const { value: statusResponse } = await getFromApi({
        url: `${this.config.baseURL}/dream-machine/v1/generations/${generationId}`,
        headers: this.config.headers(),
        abortSignal,
        fetch: this.config.fetch,
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: lumaErrorResponseSchema,
          errorToMessage: (error: LumaErrorResponse) => error.error.message,
        }),
        successfulResponseHandler: createJsonResponseHandler(
          lumaGenerationResponseSchema,
        ),
      });
      console.log('statusResponse', JSON.stringify(statusResponse, null, 2));

      if (
        statusResponse.state === 'completed' &&
        statusResponse.assets?.image
      ) {
        return statusResponse;
      }

      if (statusResponse.state === 'failed') {
        throw new APICallError({
          message: statusResponse.failure_reason || 'Image generation failed',
          url: `${this.config.baseURL}/dream-machine/v1/generations/${generationId}`,
          requestBodyValues: {},
        });
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new APICallError({
      message: 'Image generation timed out',
      url: `${this.config.baseURL}/dream-machine/v1/generations/${generationId}`,
      requestBodyValues: {},
    });
  }

  private async downloadImage(imageUrl: string): Promise<Uint8Array> {
    const { value: buffer } = await getFromApi({
      url: imageUrl,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createBinaryResponseHandler(),
      fetch: this.config.fetch,
    });
    return new Uint8Array(buffer);
  }
}

const lumaRequestSchema = z.object({
  generation_type: z.literal('image'),
  model: z.string(),
  prompt: z.string(),
  aspect_ratio: z.string().nullish(),
  callback_url: z.string().nullish(),
  image_ref: z.string().nullish(),
  style_ref: z.string().nullish(),
  character_ref: z.string().nullish(),
  modify_image_ref: z.string().nullish(),
});

const lumaGenerationResponseSchema = z.object({
  id: z.string(),
  generation_type: z.literal('image'),
  state: z.enum(['queued', 'processing', 'completed', 'failed']),
  failure_reason: z.string().nullish(),
  created_at: z.string(),
  assets: z
    .object({
      image: z.string(), // URL of the generated image
    })
    .nullish(),
  model: z.string(),
  request: lumaRequestSchema,
});

const lumaErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    code: z.string().nullish(),
  }),
});

type LumaGenerationResponse = z.infer<typeof lumaGenerationResponseSchema>;
type LumaErrorResponse = z.infer<typeof lumaErrorResponseSchema>;
type LumaRequest = z.infer<typeof lumaRequestSchema>;
