import type {
  VideoModelV3,
  VideoModelV3CallOptions,
  VideoModelV3File,
  VideoModelV3ProviderMetadata,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  type DataContent,
  type ProviderOptions,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { NoVideoGeneratedError } from '../error/no-video-generated-error';
import {
  DefaultGeneratedFile,
  type GeneratedFile,
} from '../generate-text/generated-file';
import { logWarnings } from '../logger/log-warnings';
import { resolveVideoModel } from '../model/resolve-model';
import type { VideoModel } from '../types/video-model';
import type { VideoModelResponseMetadata } from '../types/video-model-response-metadata';
import { addVideoModelUsage, type VideoModelUsage } from '../types/usage';
import type { Warning } from '../types/warning';
import {
  detectMediaType,
  videoMediaTypeSignatures,
} from '../util/detect-media-type';
import { prepareRetries } from '../util/prepare-retries';
import { VERSION } from '../version';
import type { GenerateVideoResult } from './generate-video-result';
import { splitDataUrl } from '../prompt/split-data-url';

export type GenerateVideoPrompt =
  | string
  | {
      files: Array<DataContent>;
      text?: string;
    };

/**
Generates videos using a video model.

@param model - The video model to use.
@param prompt - The prompt that should be used to generate the video.
@param n - Number of videos to generate. Default: 1.
@param aspectRatio - Aspect ratio of the videos to generate. Must have the format `{width}:{height}`.
@param resolution - Resolution of the videos to generate. Must have the format `{width}x{height}`.
@param duration - Duration of the video in seconds.
@param fps - Frames per second for the video.
@param seed - Seed for the video generation.
@param providerOptions - Additional provider-specific options that are passed through to the provider
as body parameters.
@param maxRetries - Maximum number of retries. Set to 0 to disable retries. Default: 2.
@param abortSignal - An optional abort signal that can be used to cancel the call.
@param headers - Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.

@returns A result object that contains the generated videos.
 */
export async function experimental_generateVideo({
  model: modelArg,
  prompt: promptArg,
  n = 1,
  maxVideosPerCall,
  aspectRatio,
  resolution,
  duration,
  fps,
  seed,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
}: {
  /**
The video model to use.
     */
  model: VideoModel;

  /**
The prompt that should be used to generate the video.
   */
  prompt: GenerateVideoPrompt;

  /**
Number of videos to generate.
   */
  n?: number;

  /**
Maximum number of videos per API call. If not provided, the model's default will be used.
   */
  maxVideosPerCall?: number;

  /**
Aspect ratio of the videos to generate. Must have the format `{width}:{height}`. If not provided, the default aspect ratio will be used.
   */
  aspectRatio?: `${number}:${number}`;

  /**
Resolution of the videos to generate. Must have the format `{width}x{height}`. If not provided, the default resolution will be used.
   */
  resolution?: `${number}x${number}`;

  /**
Duration of the video in seconds. If not provided, the default duration will be used.
   */
  duration?: number;

  /**
Frames per second for the video. If not provided, the default FPS will be used.
   */
  fps?: number;

  /**
Seed for the video generation. If not provided, a random seed will be used.
   */
  seed?: number;

  /**
Additional provider-specific options that are passed through to the provider
as body parameters.

The outer record is keyed by the provider name, and the inner
record is keyed by the provider-specific metadata key.
```ts
{
  "fal": {
    "loop": true
  }
}
```
     */
  providerOptions?: ProviderOptions;

  /**
Maximum number of retries per video model call. Set to 0 to disable retries.

@default 2
   */
  maxRetries?: number;

  /**
Abort signal.
 */
  abortSignal?: AbortSignal;

  /**
Additional headers to include in the request.
Only applicable for HTTP-based providers.
 */
  headers?: Record<string, string>;
}): Promise<GenerateVideoResult> {
  const model = resolveVideoModel(modelArg);

  const headersWithUserAgent = withUserAgentSuffix(
    headers ?? {},
    `ai/${VERSION}`,
  );

  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal,
  });

  const { prompt, files } = normalizePrompt(promptArg);

  const maxVideosPerCallWithDefault =
    maxVideosPerCall ?? (await invokeModelMaxVideosPerCall(model)) ?? 1;

  // parallelize calls to the model:
  const callCount = Math.ceil(n / maxVideosPerCallWithDefault);
  const callVideoCounts = Array.from({ length: callCount }, (_, index) => {
    const remaining = n - index * maxVideosPerCallWithDefault;
    return Math.min(remaining, maxVideosPerCallWithDefault);
  });

  const results = await Promise.all(
    callVideoCounts.map(async callVideoCount =>
      retry(() =>
        model.doGenerate({
          prompt,
          n: callVideoCount,
          aspectRatio,
          resolution,
          duration,
          fps,
          seed,
          files,
          providerOptions: providerOptions ?? {},
          headers: headersWithUserAgent,
          abortSignal,
        } satisfies VideoModelV3CallOptions),
      ),
    ),
  );

  // collect result videos, warnings, and response metadata
  const videos: Array<GeneratedFile> = [];
  const warnings: Array<Warning> = [];
  const responses: Array<VideoModelResponseMetadata> = [];
  const providerMetadata: VideoModelV3ProviderMetadata = {};
  let totalUsage: VideoModelUsage = {
    inputTokens: undefined,
    outputTokens: undefined,
    totalTokens: undefined,
  };

  for (const result of results) {
    for (const videoData of result.videos) {
      switch (videoData.type) {
        case 'url': {
          const response = await fetch(videoData.url);
          if (!response.ok) {
            throw new Error(
              `Failed to download video from ${videoData.url}: ${response.status} ${response.statusText}`,
            );
          }
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const mediaType =
            videoData.mediaType ||
            detectMediaType({
              data: uint8Array,
              signatures: videoMediaTypeSignatures,
            }) ||
            'video/mp4';

          videos.push(
            new DefaultGeneratedFile({
              data: uint8Array,
              mediaType,
            }),
          );
          break;
        }

        case 'base64': {
          videos.push(
            new DefaultGeneratedFile({
              data: videoData.data,
              mediaType: videoData.mediaType || 'video/mp4',
            }),
          );
          break;
        }

        case 'binary': {
          const mediaType =
            videoData.mediaType ||
            detectMediaType({
              data: videoData.data,
              signatures: videoMediaTypeSignatures,
            }) ||
            'video/mp4';

          videos.push(
            new DefaultGeneratedFile({
              data: videoData.data,
              mediaType,
            }),
          );
          break;
        }
      }
    }

    warnings.push(...result.warnings);

    if (result.usage != null) {
      totalUsage = addVideoModelUsage(totalUsage, result.usage);
    }

    responses.push({
      timestamp: result.response.timestamp,
      modelId: result.response.modelId,
      headers: result.response.headers,
    });

    if (result.providerMetadata != null) {
      for (const [provider, metadata] of Object.entries(
        result.providerMetadata,
      )) {
        if (provider === 'gateway') {
          // Special handling for gateway provider - merge metadata from actual provider
          const gatewayMetadata = metadata as {
            provider: string;
            videos: any[];
          } & Record<string, any>;

          if (providerMetadata[gatewayMetadata.provider] == null) {
            providerMetadata[gatewayMetadata.provider] = {
              videos: [],
            };
          }

          const existingMetadata = providerMetadata[gatewayMetadata.provider];

          existingMetadata.videos = [
            ...(existingMetadata.videos ?? []),
            ...gatewayMetadata.videos,
          ];

          for (const [key, value] of Object.entries(gatewayMetadata)) {
            if (key !== 'videos' && key !== 'provider') {
              (existingMetadata as any)[key] = value;
            }
          }
        } else {
          if (providerMetadata[provider] == null) {
            providerMetadata[provider] = {
              videos: [],
            };
          }

          const existingMetadata = providerMetadata[provider];

          existingMetadata.videos = [
            ...(existingMetadata.videos ?? []),
            ...(metadata.videos ?? []),
          ];

          for (const [key, value] of Object.entries(metadata)) {
            if (key !== 'videos') {
              (existingMetadata as any)[key] = value;
            }
          }
        }
      }
    }
  }

  if (videos.length === 0) {
    throw new NoVideoGeneratedError({ responses });
  }

  if (warnings.length > 0) {
    logWarnings({
      warnings,
      provider: model.provider,
      model: model.modelId,
    });
  }

  return {
    video: videos[0],
    videos,
    warnings,
    responses,
    providerMetadata,
    usage: totalUsage,
  };
}

function normalizePrompt(promptArg: GenerateVideoPrompt): {
  prompt: string | undefined;
  files: VideoModelV3File[] | undefined;
} {
  if (typeof promptArg === 'string') {
    return {
      prompt: promptArg,
      files: undefined,
    };
  }

  const files: VideoModelV3File[] = [];
  for (const dataContent of promptArg.files ?? []) {
    if (typeof dataContent === 'string') {
      if (
        dataContent.startsWith('http://') ||
        dataContent.startsWith('https://')
      ) {
        files.push({
          type: 'url',
          url: dataContent,
        });
      } else if (dataContent.startsWith('data:')) {
        const { mediaType, base64Content } = splitDataUrl(dataContent);
        files.push({
          type: 'file',
          mediaType: mediaType ?? 'image/png',
          data: convertBase64ToUint8Array(base64Content ?? ''),
        });
      } else {
        const bytes = convertBase64ToUint8Array(dataContent);
        const mediaType =
          detectMediaType({
            data: bytes,
            signatures: videoMediaTypeSignatures,
          }) ?? 'image/png';

        files.push({
          type: 'file',
          mediaType,
          data: bytes,
        });
      }
    } else if (dataContent instanceof Uint8Array) {
      // Uint8Array
      const mediaType =
        detectMediaType({
          data: dataContent,
          signatures: videoMediaTypeSignatures,
        }) ?? 'image/png';

      files.push({
        type: 'file',
        mediaType,
        data: dataContent,
      });
    }
  }

  return {
    prompt: promptArg.text,
    files: files.length > 0 ? files : undefined,
  };
}

async function invokeModelMaxVideosPerCall(model: VideoModelV3) {
  if (typeof model.maxVideosPerCall === 'function') {
    return await model.maxVideosPerCall({ modelId: model.modelId });
  }

  return model.maxVideosPerCall;
}
