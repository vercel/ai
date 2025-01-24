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

const POLL_INTERVAL_MILLIS = 5000;
const MAX_POLL_ATTEMPTS = 60000 / POLL_INTERVAL_MILLIS;

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
    private readonly config: LumaImageModelConfig,
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

    // Send request to generate image.
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { value: generationResponse, responseHeaders } = await postJsonToApi({
      url: this.getLumaGenerationsUrl(),
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

    // Poll for generation status.
    const generationId = generationResponse.id;
    console.log('generationId', generationId);
    const imageResponse = await this.pollForImage(generationId, abortSignal);

    // Download the image.
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
    let attemptCount = 0;
    const url = this.getLumaGenerationsUrl(generationId);
    while (attemptCount < MAX_POLL_ATTEMPTS) {
      console.log('polling for image', generationId);
      const { value: statusResponse } = await getFromApi({
        url,
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
          url,
          requestBodyValues: {},
        });
      }

      attemptCount++;
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MILLIS));
    }

    throw new APICallError({
      message: 'Image generation timed out',
      url,
      requestBodyValues: {},
    });
  }

  private getLumaGenerationsUrl(generationId?: string) {
    return `${this.config.baseURL}/dream-machine/v1/generations/${
      generationId || 'image'
    }`;
  }

  private async downloadImage(url: string): Promise<Uint8Array> {
    const { value: buffer } = await getFromApi({
      url,
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
  image_ref: z
    .array(
      z.object({
        url: z.string(),
        weight: z.number(),
      }),
    )
    .nullish(),
  style_ref: z
    .array(
      z.object({
        url: z.string(),
        weight: z.number(),
      }),
    )
    .nullish(),
  character_ref: z
    .object({
      identity0: z.object({
        images: z.array(z.string()),
      }),
    })
    .nullish(),
  modify_image_ref: z
    .object({
      url: z.string(),
      weight: z.number(),
    })
    .nullish(),
});

const lumaGenerationResponseSchema = z.object({
  id: z.string(),
  generation_type: z.literal('image'),
  state: z.enum(['queued', 'dreaming', 'completed', 'failed']),
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
