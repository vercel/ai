import type {
  Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions,
  Experimental_VideoModelV3File as VideoModelV3File,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import type { TencentVideoModelOptions } from './tencent-video-model-options';

export function getFileBase64(
  file: Extract<VideoModelV3File, { type: 'file' }>,
): string {
  return typeof file.data === 'string'
    ? file.data
    : convertUint8ArrayToBase64(file.data);
}

export function toUrlOrDataUri(file: VideoModelV3File): string {
  if (file.type === 'url') {
    return file.url;
  }
  return `data:${file.mediaType};base64,${getFileBase64(file)}`;
}

// `video/mp4` -> `video`. Inlined because the v6 provider-utils does not
// export `getTopLevelMediaType`.
function getMediaKind(file: VideoModelV3File): string | undefined {
  if (file.mediaType == null) {
    return undefined;
  }
  const slashIndex = file.mediaType.indexOf('/');
  return slashIndex === -1
    ? file.mediaType
    : file.mediaType.substring(0, slashIndex);
}

export const isVideoFile = (file: VideoModelV3File): boolean =>
  getMediaKind(file) === 'video';

export const isAudioFile = (file: VideoModelV3File): boolean =>
  getMediaKind(file) === 'audio';

function rejectNonImageFrame(
  file: VideoModelV3File | undefined,
  warnings: SharedV3Warning[],
): VideoModelV3File | undefined {
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
  options: VideoModelV3CallOptions,
  warnings: SharedV3Warning[],
): VideoModelV3File | undefined {
  return rejectNonImageFrame(
    options.frameImages?.find(frame => frame.frameType === 'first_frame')
      ?.image ?? options.image,
    warnings,
  );
}

export function resolveLastFrameImage(
  options: VideoModelV3CallOptions,
  warnings: SharedV3Warning[],
): VideoModelV3File | undefined {
  return rejectNonImageFrame(
    options.frameImages?.find(frame => frame.frameType === 'last_frame')?.image,
    warnings,
  );
}

export function splitInputReferences(options: VideoModelV3CallOptions): {
  images: VideoModelV3File[];
  videos: VideoModelV3File[];
  audios: VideoModelV3File[];
} {
  const images: VideoModelV3File[] = [];
  const videos: VideoModelV3File[] = [];
  const audios: VideoModelV3File[] = [];

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
  options: VideoModelV3CallOptions;
  tencentOptions: TencentVideoModelOptions | undefined;
  tiers: Record<number, string>;
  warnings: SharedV3Warning[];
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
        `(${Object.values(tiers).join(
          ', ',
        )}); the default resolution was used.`,
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
  warnings: SharedV3Warning[];
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
  options: VideoModelV3CallOptions;
  supportsSeed: boolean;
  warnings: SharedV3Warning[];
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
}
