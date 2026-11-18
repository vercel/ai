import type {
  Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  Experimental_VideoModelV4File as VideoModelV4File,
  SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertUint8ArrayToBase64,
  getTopLevelMediaType,
} from '@ai-sdk/provider-utils';
import type { TencentVideoModelOptions } from './tencent-video-model-options';

export function getFileBase64(
  file: Extract<VideoModelV4File, { type: 'file' }>,
): string {
  return typeof file.data === 'string'
    ? file.data
    : convertUint8ArrayToBase64(file.data);
}

export function toUrlOrDataUri(file: VideoModelV4File): string {
  if (file.type === 'url') {
    return file.url;
  }
  return `data:${file.mediaType};base64,${getFileBase64(file)}`;
}

function getMediaKind(file: VideoModelV4File): string | undefined {
  return file.mediaType != null
    ? getTopLevelMediaType(file.mediaType)
    : undefined;
}

export const isVideoFile = (file: VideoModelV4File): boolean =>
  getMediaKind(file) === 'video';

export const isAudioFile = (file: VideoModelV4File): boolean =>
  getMediaKind(file) === 'audio';

function rejectNonImageFrame(
  file: VideoModelV4File | undefined,
  warnings: SharedV4Warning[],
): VideoModelV4File | undefined {
  if (file != null && (isVideoFile(file) || isAudioFile(file))) {
    warnings.push({
      type: 'unsupported',
      feature: 'frameImages',
      details: 'Frame images must be images; the frame was ignored.',
    });
    return undefined;
  }
  return file;
}

export function resolveFirstFrameImage(
  options: VideoModelV4CallOptions,
  warnings: SharedV4Warning[],
): VideoModelV4File | undefined {
  return rejectNonImageFrame(
    options.frameImages?.find(frame => frame.frameType === 'first_frame')
      ?.image ?? options.image,
    warnings,
  );
}

export function resolveLastFrameImage(
  options: VideoModelV4CallOptions,
  warnings: SharedV4Warning[],
): VideoModelV4File | undefined {
  return rejectNonImageFrame(
    options.frameImages?.find(frame => frame.frameType === 'last_frame')?.image,
    warnings,
  );
}

export function splitInputReferences(options: VideoModelV4CallOptions): {
  images: VideoModelV4File[];
  videos: VideoModelV4File[];
  audios: VideoModelV4File[];
} {
  const images: VideoModelV4File[] = [];
  const videos: VideoModelV4File[] = [];
  const audios: VideoModelV4File[] = [];

  for (const reference of options.inputReferences ?? []) {
    if (isVideoFile(reference)) {
      videos.push(reference);
    } else if (isAudioFile(reference)) {
      audios.push(reference);
    } else {
      images.push(reference);
    }
  }

  return { images, videos, audios };
}

/**
 * Maps a `{width}x{height}` resolution to a provider tier keyed by the shorter
 * side, e.g. `1920x1080` and `1080x1920` both map to the 1080 tier.
 */
export function mapResolutionToTier(
  resolution: `${number}x${number}`,
  tiers: Record<number, string>,
): string | undefined {
  const [width, height] = resolution.split('x').map(Number);
  return tiers[Math.min(width, height)];
}

export function resolveResolution({
  options,
  tencentOptions,
  tiers,
  warnings,
}: {
  options: VideoModelV4CallOptions;
  tencentOptions: TencentVideoModelOptions | undefined;
  tiers: Record<number, string>;
  warnings: SharedV4Warning[];
}): string | undefined {
  if (tencentOptions?.resolution != null) {
    return tencentOptions.resolution;
  }
  if (options.resolution == null) {
    return undefined;
  }

  const tier = mapResolutionToTier(options.resolution, tiers);
  if (tier == null) {
    warnings.push({
      type: 'unsupported',
      feature: 'resolution',
      details:
        `Resolution ${options.resolution} does not map to a supported tier ` +
        `(${Object.values(tiers).join(', ')}); the default resolution was used.`,
    });
  }
  return tier;
}

export function warnIgnoredProviderOptions({
  tencentOptions,
  keys,
  details,
  warnings,
}: {
  tencentOptions: TencentVideoModelOptions | undefined;
  keys: ReadonlyArray<keyof TencentVideoModelOptions>;
  details: string;
  warnings: SharedV4Warning[];
}): void {
  if (tencentOptions == null) {
    return;
  }
  for (const key of keys) {
    if (tencentOptions[key] != null) {
      warnings.push({
        type: 'unsupported',
        feature: `providerOptions.tencent.${key}`,
        details,
      });
    }
  }
}

export function warnUnsupportedCommonOptions({
  options,
  supportsSeed,
  warnings,
}: {
  options: VideoModelV4CallOptions & { webhookUrl?: string };
  supportsSeed: boolean;
  warnings: SharedV4Warning[];
}): void {
  if (options.fps != null) {
    warnings.push({
      type: 'unsupported',
      feature: 'fps',
      details: 'Tencent video models do not support custom FPS.',
    });
  }

  if (options.n != null && options.n > 1) {
    warnings.push({
      type: 'unsupported',
      feature: 'n',
      details:
        'Tencent video models generate one video per call. ' +
        'Only 1 video will be generated.',
    });
  }

  if (!supportsSeed && options.seed != null) {
    warnings.push({
      type: 'unsupported',
      feature: 'seed',
      details: 'TokenHub Kling models do not support a seed.',
    });
  }

  if (options.webhookUrl != null) {
    warnings.push({
      type: 'unsupported',
      feature: 'webhookUrl',
      details:
        'Tencent video tasks do not accept a per-request callback URL; ' +
        'the result is retrieved by polling.',
    });
  }
}
