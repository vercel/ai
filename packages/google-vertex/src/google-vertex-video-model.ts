import {
  AISDKError,
  type Experimental_VideoModelV3 as VideoModelV3,
  type Experimental_VideoModelV3OperationStartResult as VideoModelV3OperationStartResult,
  type Experimental_VideoModelV3OperationStatusResult as VideoModelV3OperationStatusResult,
  type SharedV3ProviderMetadata,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  type FetchFunction,
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  type Resolvable,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleVertexFailedResponseHandler } from './google-vertex-error';
import type { GoogleVertexVideoModelId } from './google-vertex-video-settings';

export type GoogleVertexVideoModelOptions = {
  // Video generation options
  personGeneration?: 'dont_allow' | 'allow_adult' | 'allow_all' | null;
  negativePrompt?: string | null;
  generateAudio?: boolean | null;

  // Output configuration
  gcsOutputDirectory?: string | null;

  // Reference images (for style/asset reference)
  referenceImages?: Array<{
    bytesBase64Encoded?: string;
    gcsUri?: string;
  }> | null;

  [key: string]: unknown; // For passthrough
};

interface GoogleVertexVideoModelConfig {
  provider: string;
  baseURL: string;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  generateId?: () => string;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GoogleVertexVideoModel implements VideoModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  get maxVideosPerCall(): number {
    // Vertex supports multiple videos via sampleCount
    return 4;
  }

  constructor(
    readonly modelId: GoogleVertexVideoModelId,
    private readonly config: GoogleVertexVideoModelConfig,
  ) {}

  private async buildRequest(
    options: Parameters<NonNullable<VideoModelV3['doStart']>>[0],
  ): Promise<{
    instances: Array<Record<string, unknown>>;
    parameters: Record<string, unknown>;
    warnings: SharedV3Warning[];
    vertexOptions: GoogleVertexVideoModelOptions | undefined;
  }> {
    const warnings: SharedV3Warning[] = [];

    const vertexOptions = (await parseProviderOptions({
      provider: 'vertex',
      providerOptions: options.providerOptions,
      schema: googleVertexVideoModelOptionsSchema,
    })) as GoogleVertexVideoModelOptions | undefined;

    const instances: Array<Record<string, unknown>> = [{}];
    const instance = instances[0];

    if (options.prompt != null) {
      instance.prompt = options.prompt;
    }

    if (options.image != null) {
      if (options.image.type === 'url') {
        warnings.push({
          type: 'unsupported',
          feature: 'URL-based image input',
          details:
            'Vertex AI video models require base64-encoded images or GCS URIs. URL will be ignored.',
        });
      } else {
        const base64Data =
          typeof options.image.data === 'string'
            ? options.image.data
            : convertUint8ArrayToBase64(options.image.data);

        instance.image = {
          bytesBase64Encoded: base64Data,
          mimeType: options.image.mediaType,
        };
      }
    }

    if (vertexOptions?.referenceImages != null) {
      instance.referenceImages = vertexOptions.referenceImages;
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

    if (vertexOptions != null) {
      const opts = vertexOptions;

      if (
        opts.personGeneration !== undefined &&
        opts.personGeneration !== null
      ) {
        parameters.personGeneration = opts.personGeneration;
      }
      if (opts.negativePrompt !== undefined && opts.negativePrompt !== null) {
        parameters.negativePrompt = opts.negativePrompt;
      }
      if (opts.generateAudio !== undefined && opts.generateAudio !== null) {
        parameters.generateAudio = opts.generateAudio;
      }
      if (
        opts.gcsOutputDirectory !== undefined &&
        opts.gcsOutputDirectory !== null
      ) {
        parameters.gcsOutputDirectory = opts.gcsOutputDirectory;
      }

      for (const [key, value] of Object.entries(opts)) {
        if (
          ![
            'personGeneration',
            'negativePrompt',
            'generateAudio',
            'gcsOutputDirectory',
            'referenceImages',
          ].includes(key)
        ) {
          parameters[key] = value;
        }
      }
    }

    return { instances, parameters, warnings, vertexOptions };
  }

  private buildCompletedResult({
    finalOperation,
    responseHeaders,
    warnings,
    currentDate,
  }: {
    finalOperation: VertexOperation;
    responseHeaders: Record<string, string> | undefined;
    warnings: SharedV3Warning[];
    currentDate: Date;
  }): {
    status: 'completed';
    videos: Array<
      | { type: 'base64'; data: string; mediaType: string }
      | { type: 'url'; url: string; mediaType: string }
    >;
    warnings: SharedV3Warning[];
    providerMetadata: SharedV3ProviderMetadata;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  } {
    const response = finalOperation.response;
    if (!response?.videos || response.videos.length === 0) {
      throw new AISDKError({
        name: 'VERTEX_VIDEO_GENERATION_ERROR',
        message: `No videos in response. Response: ${JSON.stringify(finalOperation)}`,
      });
    }

    const videos: Array<
      | { type: 'base64'; data: string; mediaType: string }
      | { type: 'url'; url: string; mediaType: string }
    > = [];
    const videoMetadata: Array<{
      gcsUri?: string | null | undefined;
      mimeType?: string | null | undefined;
    }> = [];

    for (const video of response.videos) {
      if (video.bytesBase64Encoded) {
        videos.push({
          type: 'base64',
          data: video.bytesBase64Encoded,
          mediaType: video.mimeType || 'video/mp4',
        });
        videoMetadata.push({
          mimeType: video.mimeType,
        });
      } else if (video.gcsUri) {
        videos.push({
          type: 'url',
          url: video.gcsUri,
          mediaType: video.mimeType || 'video/mp4',
        });
        videoMetadata.push({
          gcsUri: video.gcsUri,
          mimeType: video.mimeType,
        });
      }
    }

    if (videos.length === 0) {
      throw new AISDKError({
        name: 'VERTEX_VIDEO_GENERATION_ERROR',
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
        'google-vertex': {
          videos: videoMetadata,
        },
      },
    };
  }

  async doStart(
    options: Parameters<NonNullable<VideoModelV3['doStart']>>[0],
  ): Promise<VideoModelV3OperationStartResult> {
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
        vertexOperationSchema,
      ),
      failedResponseHandler: googleVertexFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const operationName = operation.name;
    if (!operationName) {
      throw new AISDKError({
        name: 'VERTEX_VIDEO_GENERATION_ERROR',
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
    options: Parameters<NonNullable<VideoModelV3['doStatus']>>[0],
  ): Promise<VideoModelV3OperationStatusResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { operationName } = options.operation as { operationName: string };

    const { value: statusOperation, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/models/${this.modelId}:fetchPredictOperation`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body: {
        operationName,
      },
      successfulResponseHandler: createJsonResponseHandler(
        vertexOperationSchema,
      ),
      failedResponseHandler: googleVertexFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (!statusOperation.done) {
      return {
        status: 'pending' as const,
        response: {
          timestamp: currentDate,
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    if (statusOperation.error) {
      throw new AISDKError({
        name: 'VERTEX_VIDEO_GENERATION_FAILED',
        message: `Video generation failed: ${statusOperation.error.message}`,
      });
    }

    return this.buildCompletedResult({
      finalOperation: statusOperation,
      responseHeaders,
      warnings: [],
      currentDate,
    });
  }
}

const vertexOperationSchema = z.object({
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
      videos: z
        .array(
          z.object({
            bytesBase64Encoded: z.string().nullish(),
            gcsUri: z.string().nullish(),
            mimeType: z.string().nullish(),
          }),
        )
        .nullish(),
      raiMediaFilteredCount: z.number().nullish(),
    })
    .nullish(),
});

type VertexOperation = z.infer<typeof vertexOperationSchema>;

const googleVertexVideoModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        personGeneration: z
          .enum(['dont_allow', 'allow_adult', 'allow_all'])
          .nullish(),
        negativePrompt: z.string().nullish(),
        generateAudio: z.boolean().nullish(),
        gcsOutputDirectory: z.string().nullish(),
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
