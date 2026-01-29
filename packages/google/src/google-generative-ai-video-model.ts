import {
  AISDKError,
  Experimental_VideoModelV3,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  delay,
  FetchFunction,
  getFromApi,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  Resolvable,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleFailedResponseHandler } from './google-error';
import { GoogleGenerativeAIVideoModelId } from './google-generative-ai-video-settings';

export type GoogleGenerativeAIVideoCallOptions = {
  // Polling configuration
  pollIntervalMs?: number | null;
  pollTimeoutMs?: number | null;

  // Video generation options
  personGeneration?: 'dont_allow' | 'allow_adult' | 'allow_all' | null;
  negativePrompt?: string | null;

  // Reference images (for style/asset reference)
  referenceImages?: Array<{
    bytesBase64Encoded?: string;
    gcsUri?: string;
  }> | null;

  [key: string]: any; // For passthrough
};

const googleVideoProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),
        personGeneration: z
          .enum(['dont_allow', 'allow_adult', 'allow_all'])
          .nullish(),
        negativePrompt: z.string().nullish(),
        referenceImages: z
          .array(
            z.object({
              bytesBase64Encoded: z.string().nullish(),
              gcsUri: z.string().nullish(),
            }),
          )
          .nullish(),
      })
      .passthrough(),
  ),
);

interface GoogleGenerativeAIVideoModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId?: () => string;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GoogleGenerativeAIVideoModel implements Experimental_VideoModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  get maxVideosPerCall(): number {
    // Google supports multiple videos via sampleCount
    return 4;
  }

  constructor(
    readonly modelId: GoogleGenerativeAIVideoModelId,
    private readonly config: GoogleGenerativeAIVideoModelConfig,
  ) {}

  async doGenerate(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    // Parse provider options
    const googleOptions = (await parseProviderOptions({
      provider: 'google',
      providerOptions: options.providerOptions,
      schema: googleVideoProviderOptionsSchema,
    })) as GoogleGenerativeAIVideoCallOptions | undefined;

    // Build request body
    const instances: Array<Record<string, unknown>> = [{}];
    const instance = instances[0];

    // Add prompt
    if (options.prompt != null) {
      instance.prompt = options.prompt;
    }

    // Handle image-to-video: convert first file to base64
    if (options.files != null && options.files.length > 0) {
      const firstFile = options.files[0];

      if (firstFile.type === 'url') {
        warnings.push({
          type: 'unsupported',
          feature: 'URL-based image input',
          details:
            'Google Generative AI video models require base64-encoded images. URL will be ignored.',
        });
      } else {
        const base64Data =
          typeof firstFile.data === 'string'
            ? firstFile.data
            : convertUint8ArrayToBase64(firstFile.data);

        instance.image = {
          inlineData: {
            mimeType: firstFile.mediaType || 'image/png',
            data: base64Data,
          },
        };
      }

      if (options.files.length > 1) {
        warnings.push({
          type: 'other',
          message:
            'Google video models only support a single input image for the main prompt. Additional files are ignored.',
        });
      }
    }

    // Add reference images if provided
    if (googleOptions?.referenceImages != null) {
      instance.referenceImages = googleOptions.referenceImages.map(refImg => {
        if (refImg.bytesBase64Encoded) {
          return {
            inlineData: {
              mimeType: 'image/png',
              data: refImg.bytesBase64Encoded,
            },
          };
        } else if (refImg.gcsUri) {
          return {
            gcsUri: refImg.gcsUri,
          };
        }
        return refImg;
      });
    }

    // Build parameters object
    const parameters: Record<string, unknown> = {
      sampleCount: options.n,
    };

    // Map SDK options to Google API
    if (options.aspectRatio) {
      parameters.aspectRatio = options.aspectRatio;
    }

    if (options.resolution) {
      // Google uses specific resolution strings
      const resolutionMap: Record<string, string> = {
        '1280x720': '720p',
        '1920x1080': '1080p',
        '3840x2160': '4k',
      };
      parameters.resolution =
        resolutionMap[options.resolution] || options.resolution;
    }

    if (options.duration) {
      parameters.durationSeconds = options.duration;
    }

    if (options.seed) {
      parameters.seed = options.seed;
    }

    // Add provider-specific options
    if (googleOptions != null) {
      const opts = googleOptions as GoogleGenerativeAIVideoCallOptions;

      if (
        opts.personGeneration !== undefined &&
        opts.personGeneration !== null
      ) {
        parameters.personGeneration = opts.personGeneration;
      }
      if (opts.negativePrompt !== undefined && opts.negativePrompt !== null) {
        parameters.negativePrompt = opts.negativePrompt;
      }

      // Pass through any additional options
      for (const [key, value] of Object.entries(opts as any)) {
        if (
          ![
            'pollIntervalMs',
            'pollTimeoutMs',
            'personGeneration',
            'negativePrompt',
            'referenceImages',
          ].includes(key)
        ) {
          parameters[key] = value;
        }
      }
    }

    // Submit long-running operation
    const url = `${this.config.baseURL}/models/${this.modelId}:predictLongRunning`;

    const { value: operation } = await postJsonToApi({
      url,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body: {
        instances,
        parameters,
      },
      successfulResponseHandler: createJsonResponseHandler(
        googleOperationSchema,
      ),
      failedResponseHandler: googleFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Poll for completion
    const operationName = operation.name;

    if (!operationName) {
      throw new AISDKError({
        name: 'GOOGLE_VIDEO_GENERATION_ERROR',
        message: 'No operation name returned from API',
      });
    }

    const pollIntervalMs = googleOptions?.pollIntervalMs ?? 10000; // 10 seconds (per Google docs)
    const pollTimeoutMs = googleOptions?.pollTimeoutMs ?? 600000; // 10 minutes

    const startTime = Date.now();
    let finalOperation = operation;

    while (!finalOperation.done) {
      // Check timeout
      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'GOOGLE_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      // Wait before next poll
      await delay(pollIntervalMs);

      // Check abort signal
      if (options.abortSignal?.aborted) {
        throw new AISDKError({
          name: 'GOOGLE_VIDEO_GENERATION_ABORTED',
          message: 'Video generation request was aborted',
        });
      }

      // Poll operation status - use the full operation name
      const statusUrl = `${this.config.baseURL}/${operationName}`;

      const { value: statusOperation } = await getFromApi({
        url: statusUrl,
        headers: combineHeaders(
          await resolve(this.config.headers),
          options.headers,
        ),
        successfulResponseHandler: createJsonResponseHandler(
          googleOperationSchema,
        ),
        failedResponseHandler: googleFailedResponseHandler,
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      finalOperation = statusOperation;
    }

    // Check for error
    if (finalOperation.error) {
      throw new AISDKError({
        name: 'GOOGLE_VIDEO_GENERATION_FAILED',
        message: `Video generation failed: ${finalOperation.error.message}`,
      });
    }

    // Extract videos from response
    const response = finalOperation.response;
    if (
      !response?.generateVideoResponse?.generatedSamples ||
      response.generateVideoResponse.generatedSamples.length === 0
    ) {
      throw new AISDKError({
        name: 'GOOGLE_VIDEO_GENERATION_ERROR',
        message: 'No videos in response',
      });
    }

    // Process videos - Google returns video URLs
    const videos: Array<{ type: 'url'; url: string; mediaType: string }> = [];
    const videoMetadata: any[] = [];

    // Get API key from headers to append to download URLs
    const resolvedHeaders = await resolve(this.config.headers);
    const apiKey = resolvedHeaders?.['x-goog-api-key'];

    for (const generatedSample of response.generateVideoResponse
      .generatedSamples) {
      if (generatedSample.video?.uri) {
        // Append API key to URL for authentication during download
        const urlWithAuth = apiKey
          ? `${generatedSample.video.uri}${generatedSample.video.uri.includes('?') ? '&' : '?'}key=${apiKey}`
          : generatedSample.video.uri;

        videos.push({
          type: 'url',
          url: urlWithAuth,
          mediaType: 'video/mp4',
        });
        videoMetadata.push({
          uri: generatedSample.video.uri,
        });
      }
    }

    if (videos.length === 0) {
      throw new AISDKError({
        name: 'GOOGLE_VIDEO_GENERATION_ERROR',
        message: 'No valid videos in response',
      });
    }

    // Build provider metadata
    const providerMetadata: any = {
      google: {
        videos: videoMetadata,
      },
    };

    return {
      videos,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: undefined,
      },
      providerMetadata,
    };
  }
}

const googleOperationSchema = z.object({
  name: z.string().nullish(),
  done: z.boolean().nullish(),
  error: z
    .object({
      code: z.number().nullish(),
      message: z.string(),
      status: z.string().nullish(),
    })
    .nullish(),
  response: z
    .object({
      generateVideoResponse: z
        .object({
          generatedSamples: z
            .array(
              z.object({
                video: z
                  .object({
                    uri: z.string().nullish(),
                  })
                  .nullish(),
              }),
            )
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
});
