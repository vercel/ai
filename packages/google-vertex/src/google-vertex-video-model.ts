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
  lazySchema,
  parseProviderOptions,
  postJsonToApi,
  Resolvable,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { googleVertexFailedResponseHandler } from './google-vertex-error';
import { GoogleVertexVideoModelId } from './google-vertex-video-settings';

export type GoogleVertexVideoCallOptions = {
  // Polling configuration
  pollIntervalMs?: number | null;
  pollTimeoutMs?: number | null;

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

  [key: string]: any; // For passthrough
};

const vertexVideoProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        pollIntervalMs: z.number().positive().nullish(),
        pollTimeoutMs: z.number().positive().nullish(),
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

export class GoogleVertexVideoModel implements Experimental_VideoModelV3 {
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

  async doGenerate(
    options: Parameters<Experimental_VideoModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<Experimental_VideoModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV3Warning[] = [];

    // Parse provider options
    const vertexOptions = (await parseProviderOptions({
      provider: 'vertex',
      providerOptions: options.providerOptions,
      schema: vertexVideoProviderOptionsSchema,
    })) as GoogleVertexVideoCallOptions | undefined;

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
            'Vertex AI video models require base64-encoded images or GCS URIs. URL will be ignored.',
        });
      } else {
        const base64Data =
          typeof firstFile.data === 'string'
            ? firstFile.data
            : convertUint8ArrayToBase64(firstFile.data);

        instance.image = {
          bytesBase64Encoded: base64Data,
        };
      }

      if (options.files.length > 1) {
        warnings.push({
          type: 'other',
          message:
            'Vertex AI video models only support a single input image for the main prompt. Additional files are ignored.',
        });
      }
    }

    // Add reference images if provided
    if (vertexOptions?.referenceImages != null) {
      instance.referenceImages = vertexOptions.referenceImages;
    }

    // Build parameters object
    const parameters: Record<string, unknown> = {
      sampleCount: options.n,
    };

    // Map SDK options to Vertex API
    if (options.aspectRatio) {
      parameters.aspectRatio = options.aspectRatio;
    }

    if (options.resolution) {
      // Vertex uses specific resolution strings
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
    if (vertexOptions != null) {
      const opts = vertexOptions as GoogleVertexVideoCallOptions;

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

      // Pass through any additional options
      for (const [key, value] of Object.entries(opts as any)) {
        if (
          ![
            'pollIntervalMs',
            'pollTimeoutMs',
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
        vertexOperationSchema,
      ),
      failedResponseHandler: googleVertexFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Poll for completion
    const operationName = operation.name;

    if (!operationName) {
      throw new AISDKError({
        name: 'VERTEX_VIDEO_GENERATION_ERROR',
        message: 'No operation name returned from API',
      });
    }

    const pollIntervalMs = vertexOptions?.pollIntervalMs ?? 10000; // 10 seconds
    const pollTimeoutMs = vertexOptions?.pollTimeoutMs ?? 600000; // 10 minutes

    const startTime = Date.now();
    let finalOperation = operation;
    let responseHeaders: Record<string, string> | undefined;

    while (!finalOperation.done) {
      // Check timeout
      if (Date.now() - startTime > pollTimeoutMs) {
        throw new AISDKError({
          name: 'VERTEX_VIDEO_GENERATION_TIMEOUT',
          message: `Video generation timed out after ${pollTimeoutMs}ms`,
        });
      }

      // Wait before next poll
      await delay(pollIntervalMs);

      // Check abort signal
      if (options.abortSignal?.aborted) {
        throw new AISDKError({
          name: 'VERTEX_VIDEO_GENERATION_ABORTED',
          message: 'Video generation request was aborted',
        });
      }

      // Poll operation status using fetchPredictOperation endpoint
      // Vertex AI video requires POST to fetchPredictOperation with operationName in body
      const pollUrl = `${this.config.baseURL}/models/${this.modelId}:fetchPredictOperation`;

      const { value: statusOperation, responseHeaders: pollHeaders } =
        await postJsonToApi({
          url: pollUrl,
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

      finalOperation = statusOperation;
      responseHeaders = pollHeaders;
    }

    // Check for error
    if (finalOperation.error) {
      throw new AISDKError({
        name: 'VERTEX_VIDEO_GENERATION_FAILED',
        message: `Video generation failed: ${finalOperation.error.message}`,
      });
    }

    // Extract videos from response
    const response = finalOperation.response;
    if (!response?.generated_videos || response.generated_videos.length === 0) {
      throw new AISDKError({
        name: 'VERTEX_VIDEO_GENERATION_ERROR',
        message: 'No videos in response',
      });
    }

    // Process videos - Vertex returns base64 encoded videos or GCS URIs
    const videos: Array<
      | { type: 'base64'; data: string; mediaType: string }
      | { type: 'url'; url: string; mediaType: string }
    > = [];
    const videoMetadata: any[] = [];

    for (const generatedVideo of response.generated_videos) {
      if (generatedVideo.video?.bytesBase64Encoded) {
        videos.push({
          type: 'base64',
          data: generatedVideo.video.bytesBase64Encoded,
          mediaType: generatedVideo.video.mimeType || 'video/mp4',
        });
        videoMetadata.push({
          mimeType: generatedVideo.video.mimeType,
        });
      } else if (generatedVideo.video?.gcsUri) {
        videos.push({
          type: 'url',
          url: generatedVideo.video.gcsUri,
          mediaType: generatedVideo.video.mimeType || 'video/mp4',
        });
        videoMetadata.push({
          gcsUri: generatedVideo.video.gcsUri,
          mimeType: generatedVideo.video.mimeType,
        });
      }
    }

    if (videos.length === 0) {
      throw new AISDKError({
        name: 'VERTEX_VIDEO_GENERATION_ERROR',
        message: 'No valid videos in response',
      });
    }

    // Build provider metadata
    const providerMetadata: any = {
      'google-vertex': {
        videos: videoMetadata,
      },
    };

    return {
      videos,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
      providerMetadata,
    };
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
      generated_videos: z
        .array(
          z.object({
            video: z
              .object({
                bytesBase64Encoded: z.string().nullish(),
                gcsUri: z.string().nullish(),
                mimeType: z.string().nullish(),
              })
              .nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
});
