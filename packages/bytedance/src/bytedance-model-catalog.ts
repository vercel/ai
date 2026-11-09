import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { ByteDanceImageModelOptions } from './bytedance-image-model-options';
import type { ByteDanceVideoModelOptions } from './bytedance-video-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const byteDanceProviderOptions = {
  image: {
    watermark: {
      description:
        'Whether to add an "AI generated" watermark to the bottom-right corner of the output image.',
    },
    outputFormat: {
      description:
        'Format of the generated image file. Supported by `seedream-5-0` and `dola-seedream-5-0-pro`; `seedream-4-5` / `seedream-4-0` always return `jpeg`.',
    },
    size: {
      description:
        'A resolution level (e.g. `1K`, `2K`, `3K`, `4K`) as an alternative to passing pixel dimensions via the top-level `size` parameter. When set, this overrides the top-level `size`. Available levels vary by model.',
    },
    sequentialImageGeneration: {
      description:
        "Set to `'auto'` to generate a batch of related images (e.g. storyboards or brand visuals). Defaults to `'disabled'` (single image).",
    },
    maxImages: {
      description:
        "Maximum number of images to generate when `sequentialImageGeneration` is `'auto'`. The number of input reference images plus generated images must not exceed the model's limit.",
    },
    optimizePromptMode: {
      description:
        "Prompt optimization mode. `seedream-4-0` supports both `'standard'` and `'fast'`; other models support `'standard'` only.",
    },
  } satisfies Record<
    keyof ByteDanceImageModelOptions,
    ProviderOptionDefinition
  >,
  video: {
    watermark: { description: 'watermark' },
    generateAudio: { description: 'generateAudio' },
    cameraFixed: { description: 'cameraFixed' },
    returnLastFrame: { description: 'returnLastFrame' },
    serviceTier: { description: 'serviceTier' },
    draft: { description: 'draft' },
    lastFrameImage: { description: 'lastFrameImage' },
    referenceImages: { description: 'referenceImages' },
    referenceVideos: { description: 'referenceVideos' },
    referenceAudio: { description: 'referenceAudio' },
    pollIntervalMs: { description: 'pollIntervalMs' },
    pollTimeoutMs: { description: 'pollTimeoutMs' },
  } satisfies Record<
    keyof ByteDanceVideoModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const imageModelIds = [
  'dola-seedream-5-0-pro-260628',
  'seedream-5-0-260128',
  'seedream-5-0-lite-260128',
  'seedream-4-5-251128',
  'seedream-4-0-250828',
] as const;
const videoModelIds = [
  'dreamina-seedance-2-0-fast-260128',
  'dreamina-seedance-2-0-260128',
  'seedance-1-5-pro-251215',
  'seedance-1-0-pro-250528',
  'seedance-1-0-pro-fast-251015',
  'seedance-1-0-lite-t2v-250428',
  'seedance-1-0-lite-i2v-250428',
] as const;
const imageDetails: Partial<
  Record<string, { name: string; description: string }>
> = {
  'dola-seedream-5-0-pro-260628': {
    name: 'Seedream 5.0 Pro',
    description:
      'Text-to-image, single/multi image-to-image, interactive editing (markers). Sizes: 1K, 2K. Formats: png, jpeg. Up to 10 references.',
  },
  'seedream-5-0-260128': {
    name: 'Seedream 5.0 Lite',
    description:
      'Text-to-image, single/multi image-to-image, batch generation. Sizes: 2K, 3K, 4K. Formats: png, jpeg. Up to 14 references.',
  },
  'seedream-5-0-lite-260128': {
    name: 'Seedream 5.0 Lite',
    description:
      'Text-to-image, single/multi image-to-image, batch generation. Sizes: 2K, 3K, 4K. Formats: png, jpeg. Up to 14 references.',
  },
  'seedream-4-5-251128': {
    name: 'Seedream 4.5',
    description:
      'Text-to-image, single/multi image-to-image, batch generation. Sizes: 2K, 4K. Format: jpeg. Up to 14 references.',
  },
  'seedream-4-0-250828': {
    name: 'Seedream 4.0',
    description:
      'Text-to-image, single/multi image-to-image, batch generation, fast prompt mode. Sizes: 1K, 2K, 4K. Format: jpeg. Up to 14 references.',
  },
};
const videoDetails: Partial<
  Record<string, { name: string; description: string }>
> = {
  'dreamina-seedance-2-0-260128': {
    name: 'Seedance 2.0',
    description:
      'T2V, I2V, reference videos (up to 3), reference audio (up to 3), audio-video sync. Duration: 4-15s. Resolution: 480p, 720p.',
  },
  'dreamina-seedance-2-0-fast-260128': {
    name: 'Seedance 2.0 Fast',
    description:
      'T2V, I2V, reference videos (up to 3), reference audio (up to 3), audio-video sync. Optimized for speed. Duration: 4-15s. Resolution: 480p, 720p.',
  },
  'seedance-1-5-pro-251215': {
    name: 'Seedance 1.5 Pro',
    description:
      'T2V, I2V (first frame), I2V (first+last frame), audio-video sync, draft mode. Duration: 4-12s. Resolution: 480p, 720p, 1080p.',
  },
  'seedance-1-0-pro-250528': {
    name: 'Seedance 1.0 Pro',
    description:
      'T2V, I2V (first frame), I2V (first+last frame). Duration: 2-12s. Resolution: 480p, 720p, 1080p.',
  },
  'seedance-1-0-pro-fast-251015': {
    name: 'Seedance 1.0 Pro Fast',
    description:
      'T2V, I2V (first frame). Optimized for speed and cost. Duration: 2-12s.',
  },
  'seedance-1-0-lite-t2v-250428': {
    name: 'Seedance 1.0 Lite (T2V)',
    description:
      'Text-to-video only. Duration: 2-12s. Resolution: 480p, 720p, 1080p.',
  },
  'seedance-1-0-lite-i2v-250428': {
    name: 'Seedance 1.0 Lite (I2V)',
    description:
      'I2V (first frame), I2V (first+last frame), multi-reference images (1-4). Duration: 2-12s. Resolution: 480p, 720p.',
  },
};
export function getByteDanceImageModelEntry(modelId: string) {
  const supportsFileInputs = ((): boolean | undefined => {
    return [
      'dola-seedream-5-0-pro-260628',
      'seedream-5-0-260128',
      'seedream-5-0-lite-260128',
      'seedream-4-5-251128',
      'seedream-4-0-250828',
    ].includes(modelId)
      ? true
      : undefined;
  })();
  const supportsMaskInputs = ((): boolean | undefined => {
    return supportsFileInputs === true ? false : undefined;
  })();
  const maxImagesPerCall = 1;
  const entry = {
    capabilities: {
      image: {
        ...imageDetails[modelId],
        sizes: {
          description:
            'Accepted size or aspect ratio depends on the model and operation.',
        },
        fileInput: supportsFileInputs ?? 'unknown',
        maskInput: supportsMaskInputs ?? 'unknown',
        maxImagesPerCall: maxImagesPerCall,
      },
    },
    providerOptions: {
      image: Object.fromEntries(
        Object.keys(byteDanceProviderOptions.image).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { image: {} },
  } as const;
  return entry satisfies ModelEntry<{ image: {} }>;
}
export function getByteDanceVideoModelEntry(modelId: string) {
  return {
    capabilities: {
      video: {
        ...videoDetails[modelId],
        inputs: {
          text: true,
          image: { condition: 'Requires an image-capable Seedance model.' },
          firstFrame: {
            condition: 'Requires an image-capable Seedance model.',
          },
          lastFrame: {
            condition: 'Requires a model supporting first and last frames.',
          },
          referenceImage: {
            condition: 'Requires a model supporting reference images.',
          },
          referenceVideo: { condition: 'Requires Seedance 2.0.' },
        },
        generateAudio: {
          condition: 'Requires an audio-capable Seedance model.',
        },
        aspectRatio: true,
        resolution: true,
        duration: true,
        fps: false,
        seed: true,
        maxVideosPerCall: 1,
      },
    },
    providerOptions: {
      video: Object.fromEntries(
        Object.keys(byteDanceProviderOptions.video).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const byteDanceModelCatalog = Object.fromEntries([
  ...imageModelIds.map(id => [id, getByteDanceImageModelEntry(id)] as const),
  ...videoModelIds.map(id => [id, getByteDanceVideoModelEntry(id)] as const),
]);
