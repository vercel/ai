import {
  InvalidArgumentError,
  InvalidResponseDataError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  validateTypes,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { HeyGenConfig } from './heygen-config';
import { heygenFailedResponseHandler } from './heygen-error';
import {
  heygenVideoModelOptionsSchema,
  type HeyGenVideoAsset,
} from './heygen-video-model-options';
import type { HeyGenVideoModelId } from './heygen-video-settings';

const operationSchema = z.object({
  videoId: z.string().min(1),
  mode: z.enum(['text_to_video', 'image_to_video', 'reference_to_video']),
  resolution: z.enum(['480p', '768p', '1080p', '2k']),
});

// HeyGen's named size classes do not consistently equal the short edge.
// https://developers.heygen.com/docs/models/heygen-video#output
const frameSizes: Record<
  string,
  { resolution: '480p' | '768p' | '1080p' | '2k'; aspectRatio: string }
> = {
  '960x416': { resolution: '480p', aspectRatio: '21:9' },
  '832x480': { resolution: '480p', aspectRatio: '16:9' },
  '640x480': { resolution: '480p', aspectRatio: '4:3' },
  '480x480': { resolution: '480p', aspectRatio: '1:1' },
  '480x640': { resolution: '480p', aspectRatio: '3:4' },
  '480x832': { resolution: '480p', aspectRatio: '9:16' },
  '1536x672': { resolution: '768p', aspectRatio: '21:9' },
  '1344x768': { resolution: '768p', aspectRatio: '16:9' },
  '1024x768': { resolution: '768p', aspectRatio: '4:3' },
  '768x768': { resolution: '768p', aspectRatio: '1:1' },
  '768x1024': { resolution: '768p', aspectRatio: '3:4' },
  '768x1344': { resolution: '768p', aspectRatio: '9:16' },
  '1890x1080': { resolution: '1080p', aspectRatio: '16:9' },
  '1080x1890': { resolution: '1080p', aspectRatio: '9:16' },
  '2688x1536': { resolution: '2k', aspectRatio: '16:9' },
  '1536x2688': { resolution: '2k', aspectRatio: '9:16' },
};

export class HeyGenVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4';
  readonly maxVideosPerCall = 1;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: HeyGenVideoModelId,
    private readonly config: HeyGenConfig,
  ) {}

  static [WORKFLOW_SERIALIZE](model: HeyGenVideoModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: HeyGenVideoModelId;
    config: HeyGenConfig;
  }) {
    return new HeyGenVideoModel(options.modelId, options.config);
  }

  async doStart(
    options: Parameters<NonNullable<VideoModelV4['doStart']>>[0],
  ): Promise<VideoModelV4OperationStartResult> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const warnings: SharedV4Warning[] = [];
    const heygenOptions = await parseProviderOptions({
      provider: 'heygen',
      providerOptions: options.providerOptions,
      schema: heygenVideoModelOptionsSchema,
    });

    if (
      options.prompt == null ||
      options.prompt.length === 0 ||
      options.prompt.length > 32000
    ) {
      throw new InvalidArgumentError({
        argument: 'prompt',
        message: 'HeyGen requires a prompt between 1 and 32,000 characters.',
      });
    }
    if (
      options.duration != null &&
      (!Number.isInteger(options.duration) ||
        options.duration < 5 ||
        options.duration > 15)
    ) {
      throw new InvalidArgumentError({
        argument: 'duration',
        message: 'HeyGen duration must be an integer between 5 and 15 seconds.',
      });
    }
    if (
      options.seed != null &&
      (!Number.isInteger(options.seed) ||
        options.seed < 0 ||
        options.seed > 0xffffffff)
    ) {
      throw new InvalidArgumentError({
        argument: 'seed',
        message: 'HeyGen seed must be an unsigned 32-bit integer.',
      });
    }
    if (options.n > 1) {
      warnings.push({
        type: 'unsupported',
        feature: 'n',
        details: 'HeyGen generates one video per call.',
      });
    }
    if (options.fps != null && options.fps !== 24) {
      warnings.push({
        type: 'unsupported',
        feature: 'fps',
        details: 'HeyGen generates video at 24 fps.',
      });
    }
    if (options.generateAudio === false) {
      warnings.push({
        type: 'unsupported',
        feature: 'generateAudio',
        details: 'HeyGen always generates audio alongside the video.',
      });
    }

    const frames = options.frameImages ?? [];
    if (
      frames.some(frame => frame.frameType !== 'first_frame') ||
      frames.length > 1
    ) {
      throw new InvalidArgumentError({
        argument: 'frameImages',
        message:
          'HeyGen supports a single first frame, not last-frame conditioning.',
      });
    }
    if (frames.length > 0 && options.image != null) {
      throw new InvalidArgumentError({
        argument: 'image',
        message: 'Supply either image or a first frame, not both.',
      });
    }
    const firstFrame = frames[0]?.image ?? options.image;
    if (firstFrame != null && heygenOptions?.image != null) {
      throw new InvalidArgumentError({
        argument: 'image',
        message:
          'Supply either a standard image or providerOptions.heygen.image, not both.',
      });
    }
    const image =
      firstFrame != null ? toAsset(firstFrame, 'image') : heygenOptions?.image;
    const referenceImages: HeyGenVideoAsset[] = [];
    const referenceVideos: HeyGenVideoAsset[] = [];
    const referenceAudio: HeyGenVideoAsset[] = [];
    for (const reference of options.inputReferences ?? []) {
      if (reference.mediaType?.startsWith('video/')) {
        referenceVideos.push(toAsset(reference, 'video'));
      } else if (reference.mediaType?.startsWith('audio/')) {
        referenceAudio.push(toAsset(reference, 'audio'));
      } else if (reference.mediaType?.startsWith('image/')) {
        referenceImages.push(toAsset(reference, 'image'));
      } else {
        throw new InvalidArgumentError({
          argument: 'inputReferences',
          message:
            'HeyGen references require an image, video, or audio mediaType.',
        });
      }
    }
    referenceImages.push(...(heygenOptions?.referenceImages ?? []));
    referenceVideos.push(...(heygenOptions?.referenceVideos ?? []));
    referenceAudio.push(...(heygenOptions?.referenceAudio ?? []));
    const referenceCount =
      referenceImages.length + referenceVideos.length + referenceAudio.length;
    if (
      referenceImages.length > 9 ||
      referenceVideos.length > 3 ||
      referenceAudio.length > 3 ||
      referenceCount > 12
    ) {
      throw new InvalidArgumentError({
        argument: 'inputReferences',
        message:
          'HeyGen accepts at most 9 images, 3 videos, 3 audio references, and 12 references in total.',
      });
    }
    const mode =
      heygenOptions?.mode ??
      (image != null
        ? 'image_to_video'
        : referenceCount > 0
          ? 'reference_to_video'
          : 'text_to_video');
    if (
      (mode === 'image_to_video' && image == null) ||
      (mode !== 'image_to_video' && image != null)
    ) {
      throw new InvalidArgumentError({
        argument: 'image',
        message:
          'A first-frame image is required for image_to_video and cannot be used in other modes.',
      });
    }
    if (
      (mode !== 'reference_to_video' && referenceCount > 0) ||
      (mode === 'reference_to_video' &&
        referenceImages.length + referenceVideos.length === 0)
    ) {
      throw new InvalidArgumentError({
        argument: 'inputReferences',
        message:
          'References are only supported in reference_to_video, which requires at least one image or video reference.',
      });
    }

    const frameSize =
      options.resolution != null && heygenOptions?.resolution == null
        ? frameSizes[options.resolution]
        : undefined;
    if (
      options.resolution != null &&
      heygenOptions?.resolution == null &&
      frameSize == null
    ) {
      throw new InvalidArgumentError({
        argument: 'resolution',
        message:
          'Unsupported HeyGen frame size. Use a documented frame size or providerOptions.heygen.resolution to select 480p, 768p, 1080p, or 2k.',
      });
    }
    const resolution =
      heygenOptions?.resolution ?? frameSize?.resolution ?? '768p';
    const aspectRatio =
      options.aspectRatio ??
      frameSize?.aspectRatio ??
      (mode === 'text_to_video' ? '16:9' : 'adaptive');
    if (mode === 'image_to_video') {
      if (options.aspectRatio != null || frameSize != null) {
        warnings.push({
          type: 'unsupported',
          feature: 'aspectRatio',
          details:
            'HeyGen image-to-video follows the first frame aspect ratio; only the resolution size class is applied.',
        });
      }
    } else {
      if (
        ![
          '21:9',
          '16:9',
          '4:3',
          '1:1',
          '3:4',
          '9:16',
          ...(mode === 'reference_to_video' ? ['adaptive'] : []),
        ].includes(aspectRatio)
      ) {
        throw new InvalidArgumentError({
          argument: 'aspectRatio',
          message: `Unsupported HeyGen aspect ratio for ${mode}: ${aspectRatio}.`,
        });
      }
      if (
        (resolution === '1080p' || resolution === '2k') &&
        aspectRatio !== '16:9' &&
        aspectRatio !== '9:16'
      ) {
        throw new InvalidArgumentError({
          argument: 'aspectRatio',
          message:
            'HeyGen 1080p and 2k require an explicit 16:9 or 9:16 aspect ratio for text-to-video and reference-to-video.',
        });
      }
    }

    const { value, responseHeaders } = await postJsonToApi({
      url: `${this.config.baseURL}/v3/models/videos`,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      body: {
        model: this.modelId,
        mode,
        prompt: options.prompt,
        duration: options.duration ?? 5,
        resolution,
        ...(mode !== 'image_to_video' ? { aspect_ratio: aspectRatio } : {}),
        seed: options.seed,
        prompt_enhancement: heygenOptions?.promptEnhancement,
        ...(image != null ? { image: assetBody(image, 'image') } : {}),
        ...(referenceImages.length > 0
          ? {
              reference_images: referenceImages.map(asset =>
                assetBody(asset, 'image'),
              ),
            }
          : {}),
        ...(referenceVideos.length > 0
          ? {
              reference_videos: referenceVideos.map(asset =>
                assetBody(asset, 'video'),
              ),
            }
          : {}),
        ...(referenceAudio.length > 0
          ? {
              reference_audio: referenceAudio.map(asset =>
                assetBody(asset, 'audio'),
              ),
            }
          : {}),
      },
      successfulResponseHandler: createJsonResponseHandler(
        z.object({ data: z.object({ video_id: z.string().min(1) }) }),
      ),
      failedResponseHandler: heygenFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });
    const operation = { videoId: value.data.video_id, mode, resolution };
    return {
      operation,
      warnings,
      providerMetadata: { heygen: operation },
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
    const operation = await validateTypes({
      value: options.operation,
      schema: operationSchema,
    });
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const {
      value: { data },
      responseHeaders,
    } = await getFromApi({
      url: `${this.config.baseURL}/v3/models/videos/${encodeURIComponent(operation.videoId)}`,
      validateUrl: true,
      trustedOrigin: this.config.baseURL,
      credentialedOrigin: this.config.baseURL,
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      successfulResponseHandler: createJsonResponseHandler(
        z.object({
          data: z.object({
            status: z.string(),
            video_url: z.string().nullish(),
            duration: z.number().nullish(),
            width: z.number().nullish(),
            height: z.number().nullish(),
            aspect_ratio: z.string().nullish(),
            seed: z.number().nullish(),
            timings: z.object({ inference: z.number().nullish() }).nullish(),
            failure_code: z.string().nullish(),
            failure_message: z.string().nullish(),
          }),
        }),
      ),
      failedResponseHandler: heygenFailedResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });
    const response = {
      timestamp: currentDate,
      modelId: this.modelId,
      headers: responseHeaders,
    };
    const providerMetadata = {
      heygen: {
        ...operation,
        ...(data.duration != null ? { duration: data.duration } : {}),
        ...(data.width != null ? { width: data.width } : {}),
        ...(data.height != null ? { height: data.height } : {}),
        ...(data.aspect_ratio != null
          ? { aspectRatio: data.aspect_ratio }
          : {}),
        ...(data.seed != null ? { seed: data.seed } : {}),
        ...(data.timings?.inference != null
          ? { timings: { inference: data.timings.inference } }
          : {}),
        ...(data.failure_code != null
          ? { failureCode: data.failure_code }
          : {}),
      },
    };
    if (data.status === 'pending' || data.status === 'processing') {
      return {
        status: 'pending',
        response,
        providerMetadata,
      };
    }
    if (data.status === 'failed' || data.status === 'cancelled') {
      return {
        status: 'error',
        error: `${data.failure_message ?? `HeyGen video generation ${data.status}`}${data.failure_code != null ? ` (${data.failure_code})` : ''}`,
        providerMetadata,
        response,
      };
    }
    if (
      data.status !== 'completed' ||
      data.video_url == null ||
      data.video_url.length === 0
    ) {
      throw new InvalidResponseDataError({
        data,
        message:
          'HeyGen returned an unexpected video status or a completed video without a URL.',
      });
    }
    return {
      status: 'completed',
      videos: [{ type: 'url', url: data.video_url, mediaType: 'video/mp4' }],
      warnings: [],
      response,
      // The SDK concatenates per-video metadata when generating multiple clips.
      providerMetadata: { heygen: { videos: [providerMetadata.heygen] } },
    };
  }
}

function toAsset(
  file: VideoModelV4File,
  kind: 'image' | 'video' | 'audio',
): HeyGenVideoAsset {
  if (file.mediaType != null && !file.mediaType.startsWith(`${kind}/`)) {
    throw new InvalidArgumentError({
      argument: kind,
      message: `Expected a ${kind} mediaType.`,
    });
  }
  return file.type === 'url'
    ? { type: 'url', url: file.url }
    : {
        type: 'base64',
        mediaType: file.mediaType,
        data:
          typeof file.data === 'string'
            ? file.data
            : convertUint8ArrayToBase64(file.data),
      };
}

function assetBody(asset: HeyGenVideoAsset, kind: 'image' | 'video' | 'audio') {
  switch (asset.type) {
    case 'url': {
      const parsed = z.url().startsWith('https://').safeParse(asset.url);
      if (!parsed.success) {
        throw new InvalidArgumentError({
          argument: kind,
          message: 'HeyGen input URLs must be absolute HTTPS URLs.',
        });
      }
      return { type: 'url', url: asset.url };
    }
    case 'asset_id':
      return { type: 'asset_id', asset_id: asset.assetId };
    case 'base64':
      if (!asset.mediaType.startsWith(`${kind}/`)) {
        throw new InvalidArgumentError({
          argument: kind,
          message: `Expected a ${kind} mediaType.`,
        });
      }
      return { type: 'base64', media_type: asset.mediaType, data: asset.data };
  }
}
