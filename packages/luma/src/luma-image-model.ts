import {
  ImageModelV2,
  ImageModelV2CallWarning,
  InvalidResponseDataError,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  combineHeaders,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  createJsonErrorResponseHandler,
  createStatusCodeErrorResponseHandler,
  delay,
  getFromApi,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { LumaImageSettings } from './luma-image-settings';
import { z } from 'zod/v4';

const DEFAULT_POLL_INTERVAL_MILLIS = 500;
const DEFAULT_MAX_POLL_ATTEMPTS = 60000 / DEFAULT_POLL_INTERVAL_MILLIS;

interface LumaImageModelConfig {
  provider: string;
  baseURL: string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class LumaImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
  readonly maxImagesPerCall = 1;
  readonly pollIntervalMillis = DEFAULT_POLL_INTERVAL_MILLIS;
  readonly maxPollAttempts = DEFAULT_MAX_POLL_ATTEMPTS;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: string,
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
  }: Parameters<ImageModelV2['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV2['doGenerate']>>
  > {
    const warnings: Array<ImageModelV2CallWarning> = [];

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

    // remove non-request options from providerOptions
    const { pollIntervalMillis, maxPollAttempts, ...providerRequestOptions } =
      providerOptions.luma ?? {};

    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const fullHeaders = combineHeaders(this.config.headers(), headers);
    const { value: generationResponse, responseHeaders } = await postJsonToApi({
      url: this.getLumaGenerationsUrl(),
      headers: fullHeaders,
      body: {
        prompt,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        model: this.modelId,
        ...providerRequestOptions,
      },
      abortSignal,
      fetch: this.config.fetch,
      failedResponseHandler: this.createLumaErrorHandler(),
      successfulResponseHandler: createJsonResponseHandler(
        lumaGenerationResponseSchema,
      ),
    });

    const imageUrl = await this.pollForImageUrl(
      generationResponse.id,
      fullHeaders,
      abortSignal,
      providerOptions.luma,
    );

    const downloadedImage = await this.downloadImage(imageUrl, abortSignal);

    return {
      images: [downloadedImage],
      warnings,
      response: {
        modelId: this.modelId,
        timestamp: currentDate,
        headers: responseHeaders,
      },
    };
  }

  private async pollForImageUrl(
    generationId: string,
    headers: Record<string, string | undefined>,
    abortSignal: AbortSignal | undefined,
    imageSettings?: LumaImageSettings,
  ): Promise<string> {
    const url = this.getLumaGenerationsUrl(generationId);
    const maxPollAttempts =
      imageSettings?.maxPollAttempts ?? this.maxPollAttempts;
    const pollIntervalMillis =
      imageSettings?.pollIntervalMillis ?? this.pollIntervalMillis;

    for (let i = 0; i < maxPollAttempts; i++) {
      const { value: statusResponse } = await getFromApi({
        url,
        headers,
        abortSignal,
        fetch: this.config.fetch,
        failedResponseHandler: this.createLumaErrorHandler(),
        successfulResponseHandler: createJsonResponseHandler(
          lumaGenerationResponseSchema,
        ),
      });

      switch (statusResponse.state) {
        case 'completed':
          if (!statusResponse.assets?.image) {
            throw new InvalidResponseDataError({
              data: statusResponse,
              message: `Image generation completed but no image was found.`,
            });
          }
          return statusResponse.assets.image;
        case 'failed':
          throw new InvalidResponseDataError({
            data: statusResponse,
            message: `Image generation failed.`,
          });
      }
      await delay(pollIntervalMillis);
    }

    throw new Error(
      `Image generation timed out after ${this.maxPollAttempts} attempts.`,
    );
  }

  private createLumaErrorHandler() {
    return createJsonErrorResponseHandler({
      errorSchema: lumaErrorSchema,
      errorToMessage: (error: LumaErrorData) =>
        error.detail[0].msg ?? 'Unknown error',
    });
  }

  private getLumaGenerationsUrl(generationId?: string) {
    return `${this.config.baseURL}/dream-machine/v1/generations/${
      generationId ?? 'image'
    }`;
  }

  private async downloadImage(
    url: string,
    abortSignal: AbortSignal | undefined,
  ): Promise<Uint8Array> {
    const { value: response } = await getFromApi({
      url,
      // No specific headers should be needed for this request as it's a
      // generated image provided by Luma.
      abortSignal,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createBinaryResponseHandler(),
      fetch: this.config.fetch,
    });
    return response;
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const lumaGenerationResponseSchema = z.object({
  id: z.string(),
  state: z.enum(['queued', 'dreaming', 'completed', 'failed']),
  failure_reason: z.string().nullish(),
  assets: z
    .object({
      image: z.string(), // URL of the generated image
    })
    .nullish(),
});

const lumaErrorSchema = z.object({
  detail: z.array(
    z.object({
      type: z.string(),
      loc: z.array(z.string()),
      msg: z.string(),
      input: z.string(),
      ctx: z
        .object({
          expected: z.string(),
        })
        .nullish(),
    }),
  ),
});

export type LumaErrorData = z.infer<typeof lumaErrorSchema>;
