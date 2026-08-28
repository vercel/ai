import {
  AISDKError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  getFromApi,
  isSameOrigin,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleFailedResponseHandler } from './google-error';
import {
  googleVideoModelOptionsSchema,
  type GoogleVideoModelOptions,
} from './google-video-model-options';
import type { GoogleVideoModelId } from './google-video-settings';

interface GoogleVideoModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId?: () => string;
  _internal?: {
    currentDate?: () => Date;
  };
}

function getFirstFrameImage(
  options: VideoModelV4CallOptions,
): VideoModelV4File | undefined {
  return options.frameImages?.find(frame => frame.frameType === 'first_frame')
    ?.image;
}

function resolveStartImage(
  options: VideoModelV4CallOptions,
): VideoModelV4File | undefined {
  return getFirstFrameImage(options) ?? options.image;
}

function getLastFrameImage(
  options: VideoModelV4CallOptions,
): VideoModelV4File | undefined {
  return options.frameImages?.find(frame => frame.frameType === 'last_frame')
    ?.image;
}

function getInputReferences(
  options: VideoModelV4CallOptions,
): Array<VideoModelV4File> | undefined {
  if (options.frameImages != null && options.frameImages.length > 0) {
    return undefined;
  }

  return options.inputReferences != null && options.inputReferences.length > 0
    ? options.inputReferences
    : undefined;
}

function convertFileToGoogleImage(
  file: VideoModelV4File,
  warnings: SharedV4Warning[],
): Record<string, unknown> | undefined {
  if (file.type === 'url') {
    if (file.url.startsWith('gs://')) {
      return {
        gcsUri: file.url,
        mimeType: 'image/png',
      };
    }

    warnings.push({
      type: 'unsupported',
      feature: 'URL-based image input',
      details:
        'Google Generative AI video models require base64-encoded images or GCS URIs. URL will be ignored.',
    });
    return undefined;
  }

  const base64Data =
    typeof file.data === 'string'
      ? file.data
      : convertUint8ArrayToBase64(file.data);

  // Veo's predictLongRunning endpoint uses Vertex-style image payloads, not
  // Gemini generateContent inlineData.
  return {
    bytesBase64Encoded: base64Data,
    mimeType: file.mediaType || 'image/png',
  };
}

function convertProviderReferenceImage(
  refImg: NonNullable<GoogleVideoModelOptions['referenceImages']>[number],
): Record<string, unknown> {
  if (refImg.bytesBase64Encoded) {
    return {
      image: {
        bytesBase64Encoded: refImg.bytesBase64Encoded,
        mimeType: 'image/png',
      },
      referenceType: 'asset',
    };
  }

  if (refImg.gcsUri) {
    return {
      image: {
        gcsUri: refImg.gcsUri,
        mimeType: 'image/png',
      },
      referenceType: 'asset',
    };
  }

  return refImg;
}

function convertInputReferenceImage(
  file: VideoModelV4File,
  warnings: SharedV4Warning[],
): Record<string, unknown> | undefined {
  const image = convertFileToGoogleImage(file, warnings);
  return image != null ? { image, referenceType: 'asset' } : undefined;
}

export class GoogleVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  get maxVideosPerCall(): number {
    // Google supports multiple videos via sampleCount
    return 4;
  }

  constructor(
    readonly modelId: GoogleVideoModelId,
    private readonly config: GoogleVideoModelConfig,
  ) {}

  private async buildRequest(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<{
    instances: Array<Record<string, unknown>>;
    parameters: Record<string, unknown>;
    warnings: SharedV4Warning[];
    googleOptions: GoogleVideoModelOptions | undefined;
  }> {
    const warnings: SharedV4Warning[] = [];

    const googleOptions = (await parseProviderOptions({
      provider: 'google',
      providerOptions: options.providerOptions,
      schema: googleVideoModelOptionsSchema,
    })) as GoogleVideoModelOptions | undefined;

    const instances: Array<Record<string, unknown>> = [{}];
    const instance = instances[0];

    if (options.prompt != null) {
      instance.prompt = options.prompt;
    }

    const startImage = resolveStartImage(options);
    if (startImage != null) {
      const image = convertFileToGoogleImage(startImage, warnings);
      if (image != null) {
        instance.image = image;
      }
    }

    const lastFrameImage = getLastFrameImage(options);
    if (lastFrameImage != null) {
      const lastFrame = convertFileToGoogleImage(lastFrameImage, warnings);
      if (lastFrame != null) {
        instance.lastFrame = lastFrame;
      }
    }

    const inputReferences = getInputReferences(options);
    if (inputReferences != null) {
      instance.referenceImages = inputReferences.flatMap(reference => {
        const converted = convertInputReferenceImage(reference, warnings);
        return converted != null ? [converted] : [];
      });
    } else if (googleOptions?.referenceImages != null) {
      instance.referenceImages = googleOptions.referenceImages.map(refImg =>
        convertProviderReferenceImage(refImg),
      );
    }

    const parameters: Record<string, unknown> = {
      sampleCount: options.n,
    };

    if (options.aspectRatio) {
      parameters.aspectRatio = options.aspectRatio;
    }

    if (options.resolution) {
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

    if (googleOptions != null) {
      const opts = googleOptions as GoogleVideoModelOptions;

      if (
        opts.personGeneration !== undefined &&
        opts.personGeneration !== null
      ) {
        parameters.personGeneration = opts.personGeneration;
      }
      if (opts.negativePrompt !== undefined && opts.negativePrompt !== null) {
        parameters.negativePrompt = opts.negativePrompt;
      }

      for (const [key, value] of Object.entries(opts)) {
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

    return { instances, parameters, warnings, googleOptions };
  }

  private async buildCompletedResult(
    finalOperation: z.infer<typeof googleOperationSchema>,
    responseHeaders: Record<string, string> | undefined,
    warnings: SharedV4Warning[],
    currentDate: Date,
  ): Promise<{
    status: 'completed';
    videos: Array<{ type: 'url'; url: string; mediaType: string }>;
    warnings: SharedV4Warning[];
    providerMetadata: SharedV4ProviderMetadata;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  }> {
    const response = finalOperation.response;
    if (
      !response?.generateVideoResponse?.generatedSamples ||
      response.generateVideoResponse.generatedSamples.length === 0
    ) {
      throw new AISDKError({
        name: 'GOOGLE_VIDEO_GENERATION_ERROR',
        message: `No videos in response. Response: ${JSON.stringify(finalOperation)}`,
      });
    }

    const videos: Array<{ type: 'url'; url: string; mediaType: string }> = [];
    const videoMetadata: Array<{ uri: string }> = [];

    // Get API key from headers to append to download URLs
    const resolvedHeaders = await resolve(this.config.headers);
    const apiKey = resolvedHeaders?.['x-goog-api-key'];

    for (const generatedSample of response.generateVideoResponse
      .generatedSamples) {
      if (generatedSample.video?.uri) {
        // Append the API key to the download URL for authentication, but only
        // when the response-supplied URI stays on the provider's own origin —
        // otherwise the key would leak to whatever host the response names.
        const urlWithAuth =
          apiKey && isSameOrigin(generatedSample.video.uri, this.config.baseURL)
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

    return {
      status: 'completed',
      videos,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata: {
        google: {
          videos: videoMetadata,
        },
      },
    };
  }

  async doStart(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<VideoModelV4OperationStartResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { instances, parameters, warnings } =
      await this.buildRequest(options);

    const { value: operation, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:predictLongRunning`,
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

    const operationName = operation.name;
    if (!operationName) {
      throw new AISDKError({
        name: 'GOOGLE_VIDEO_GENERATION_ERROR',
        message: 'No operation name returned from API',
      });
    }

    return {
      operation: { operationName },
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }

  async doStatus(
    options: Parameters<NonNullable<VideoModelV4['doStatus']>>[0],
  ): Promise<VideoModelV4OperationStatusResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { operationName } = options.operation as { operationName: string };

    const { value: statusOperation, responseHeaders } = await getFromApi({
      url: `${this.config.baseURL}/${operationName}`,
      validateUrl: false,
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

    if (!statusOperation.done) {
      return {
        status: 'pending',
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    if (statusOperation.error) {
      return {
        status: 'error' as const,
        error: `Video generation failed: ${statusOperation.error.message}`,
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    return this.buildCompletedResult(
      statusOperation,
      responseHeaders,
      [],
      currentDate,
    );
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
