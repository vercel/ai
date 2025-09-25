import { VideoModelV2, VideoModelV2ProviderMetadata } from '@ai-sdk/provider';
import { ProviderOptions, withUserAgentSuffix } from '@ai-sdk/provider-utils';
import { UnsupportedModelVersionError } from '../error/unsupported-model-version-error';
import { DefaultGeneratedFile, GeneratedFile } from '../generate-text/generated-file';
import { prepareRetries } from '../util/prepare-retries';
import { logWarnings } from '../logger/log-warnings';
import { VERSION } from '../version';
import { VideoGenerationWarning } from '../types/video-model';
import { VideoModelResponseMetadata } from '../types/video-model-response-metadata';
import { GenerateVideoResult } from './generate-video-result';
import { NoVideoGeneratedError } from '../error/no-video-generated-error';
import { detectMediaType, videoMediaTypeSignatures } from '../util/detect-media-type';

const defaultVideoMediaType = 'video/mp4';

export async function generateVideo({
  model,
  prompt,
  n = 1,
  maxVideosPerCall,
  resolution,
  aspectRatio,
  durationSeconds,
  fps,
  seed,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
}: {
  model: VideoModelV2;
  prompt: string;
  n?: number;
  maxVideosPerCall?: number;
  resolution?: `${number}x${number}`;
  aspectRatio?: `${number}:${number}`;
  durationSeconds?: number;
  fps?: number;
  seed?: number | string;
  providerOptions?: ProviderOptions;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}): Promise<GenerateVideoResult> {
  if (model.specificationVersion !== 'v2') {
    throw new UnsupportedModelVersionError({
      version: model.specificationVersion,
      provider: model.provider,
      modelId: model.modelId,
    });
  }

  const headersWithUserAgent = withUserAgentSuffix(headers ?? {}, `ai/${VERSION}`);

  const { retry } = prepareRetries({ maxRetries: maxRetriesArg, abortSignal });

  const maxVideosPerCallWithDefault =
    maxVideosPerCall ?? (await invokeModelMaxVideosPerCall(model)) ?? 1;

  const callCount = Math.ceil(n / maxVideosPerCallWithDefault);
  const callVideoCounts = Array.from({ length: callCount }, (_, i) => {
    if (i < callCount - 1) return maxVideosPerCallWithDefault;
    const remainder = n % maxVideosPerCallWithDefault;
    return remainder === 0 ? maxVideosPerCallWithDefault : remainder;
  });

  const results = await Promise.all(
    callVideoCounts.map(async callVideoCount =>
      retry(() =>
        model.doGenerate({
          prompt,
          n: callVideoCount,
          abortSignal,
          headers: headersWithUserAgent,
          resolution,
          aspectRatio,
          durationSeconds,
          fps,
          seed,
          providerOptions: providerOptions ?? {},
        }),
      ),
    ),
  );

  const videos: Array<DefaultGeneratedFile> = [];
  const warnings: Array<VideoGenerationWarning> = [];
  const responses: Array<VideoModelResponseMetadata> = [];
  const providerMetadata: VideoModelV2ProviderMetadata = {} as VideoModelV2ProviderMetadata;

  for (const result of results) {
    videos.push(
      ...result.videos.map(video =>
        new DefaultGeneratedFile({
          data: video,
          mediaType:
            detectMediaType({
              data: video,
              signatures: videoMediaTypeSignatures,
            }) ?? defaultVideoMediaType,
        }),
      ),
    );

    warnings.push(...result.warnings);

    if (result.providerMetadata) {
      for (const [providerName] of Object.entries<{ videos: unknown }>(
        result.providerMetadata,
      )) {
        providerMetadata[providerName] ??= { videos: [] } as any;
        (providerMetadata[providerName] as any).videos.push(
          ...(result.providerMetadata as any)[providerName].videos,
        );
      }
    }

    responses.push(result.response);
  }

  logWarnings(warnings);

  if (!videos.length) {
    throw new NoVideoGeneratedError({ responses });
  }

  return new DefaultGenerateVideoResult({
    videos,
    warnings,
    responses,
    providerMetadata: providerMetadata as any,
  });
}

class DefaultGenerateVideoResult implements GenerateVideoResult {
  readonly videos: Array<GeneratedFile>;
  readonly warnings: Array<VideoGenerationWarning>;
  readonly responses: Array<VideoModelResponseMetadata>;
  readonly providerMetadata: VideoModelV2ProviderMetadata;

  constructor(options: {
    videos: Array<GeneratedFile>;
    warnings: Array<VideoGenerationWarning>;
    responses: Array<VideoModelResponseMetadata>;
    providerMetadata: VideoModelV2ProviderMetadata;
  }) {
    this.videos = options.videos;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata;
  }

  get video() {
    return this.videos[0];
  }
}

async function invokeModelMaxVideosPerCall(model: VideoModelV2) {
  const isFunction = model.maxVideosPerCall instanceof Function;
  if (!isFunction) return model.maxVideosPerCall;
  return model.maxVideosPerCall({ modelId: model.modelId });
}


