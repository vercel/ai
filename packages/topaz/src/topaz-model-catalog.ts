import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { TopazImageModelOptions } from './topaz-image-model-options';
import type { TopazVideoModelOptions } from './topaz-video-model-options';

export const topazProviderOptions = {
  image: {
    enhancementStrength: {
      description:
        'How aggressively the model enhances the image. Defaults to `high`.',
    },
    grain: {
      description: 'Whether to add grain to the output. Defaults to `false`.',
    },
    grainDensity: {
      description: 'Grain intensity, 0.0 to 1.0. Defaults to 0.5.',
    },
    grainModel: { description: 'Grain model. Defaults to `silver`.' },
    grainSize: { description: 'Grain particle size, 1 to 5. Defaults to 1.' },
    grainStrength: {
      description: 'Grain effect strength, 0.0 to 1.0. Defaults to 0.5.',
    },
    inputWidth: {
      description:
        'Width of the input image in pixels. Topaz infers this from the upload when omitted.',
    },
    inputHeight: {
      description:
        'Height of the input image in pixels. Topaz infers this from the upload when omitted.',
    },
    outputWidth: {
      description:
        'Width of the output image in pixels, 1 to 32000. Takes precedence over the width derived from the `size` call option.',
    },
    outputHeight: {
      description:
        'Height of the output image in pixels, 1 to 32000. Takes precedence over the height derived from the `size` call option.',
    },
    outputFormat: {
      description: 'Output image format. Defaults to the Topaz API default.',
    },
    cropToFill: {
      description:
        'Whether to crop the output to fill the requested dimensions. Defaults to `false`.',
    },
    webhookUrl: { description: 'URL to receive job-status webhooks.' },
    pollIntervalMillis: {
      description:
        'How often to poll the Topaz status endpoint, in milliseconds. Defaults to 2000.',
    },
    pollTimeoutMillis: {
      description:
        'How long to wait for the job to finish before failing, in milliseconds. Defaults to 600000 (10 minutes).',
    },
  } satisfies Record<keyof TopazImageModelOptions, ProviderOptionDefinition>,
  video: {
    source: { description: 'Input video metadata and container settings.' },
    output: {
      description:
        'Output dimensions, encoding, container, frame rate, and audio transfer settings.',
    },
    additionalFilters: {
      description:
        "Extra `filters[]` entries to send alongside the model's own filter, e.g. a frame-interpolation filter. Each entry must include a `model` key.",
    },
    filter: {
      description:
        "Escape hatch for filter settings this package does not model yet. Merged into the model's filter entry, taking precedence over the typed options below.",
    },
    videoType: { description: 'Proteus: how the input frames are encoded.' },
    auto: { description: 'Proteus: parameter estimation mode.' },
    fieldOrder: { description: 'Proteus: field order for interlaced input.' },
    focusFixLevel: { description: 'Proteus: focus-fix strength.' },
    compression: {
      description: 'Proteus: compression artifact removal, -1 to 1.',
    },
    details: { description: 'Proteus: detail recovery, -1 to 1.' },
    prenoise: {
      description: 'Proteus: pre-processing noise reduction, 0 to 0.1.',
    },
    noise: { description: 'Proteus: noise reduction, -1 to 1.' },
    halo: { description: 'Proteus: halo suppression, -1 to 1.' },
    preblur: { description: 'Proteus: pre-processing blur, -1 to 1.' },
    blur: { description: 'Proteus: sharpening, -1 to 1.' },
    grain: { description: 'Proteus: grain amount, 0 to 0.1.' },
    grainSigma: { description: 'Proteus: grain sigma, 0 to 1.' },
    grainSize: { description: 'Proteus: grain size, 0 to 5.' },
    grainType: { description: 'Proteus: grain model.' },
    recoverOriginalDetailValue: {
      description: 'Proteus: original detail recovery, 0 to 1.',
    },
    sharpness: {
      description:
        'Starlight: sharpening applied to the output, 1.0 to 5.0. Defaults to 5.0.',
    },
    videoBitDepth: { description: 'Starlight: output bit depth.' },
    videoCodec: { description: 'Starlight: output video codec.' },
    videoProfile: {
      description: 'Starlight: output chroma subsampling profile.',
    },
    watermark: {
      description:
        'Starlight: whether to watermark the output. Defaults to `false`.',
    },
  } satisfies Record<keyof TopazVideoModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

export const topazImageModelIds = ['wonder-3.5'] as const;
export const topazVideoModelIds = ['proteus', 'starlight-precise-2.6'] as const;

export const topazImageApiModelIds: Record<string, string> = {
  'wonder-3.5': 'Wonder 3.5',
};
export const topazVideoApiModelIds: Record<string, string> = {
  proteus: 'prob-4',
  'starlight-precise-2.6': 'slp-2.6',
};
export const topazImageCapabilities = {
  sizes: { description: 'Output width and height from 1 to 32000 pixels.' },
  fileInput: true,
  maskInput: false,
  maxImagesPerCall: 1,
} as const;
export const topazVideoCapabilities = {
  inputs: {
    text: false,
    image: false,
    firstFrame: false,
    lastFrame: false,
    referenceImage: false,
    referenceVideo: true,
  },
  generateAudio: false,
  aspectRatio: false,
  resolution: true,
  duration: false,
  fps: true,
  seed: false,
  maxVideosPerCall: 1,
} as const;
export const topazImageRequestDefaults = {
  pollIntervalMillis: 2000,
  pollTimeoutMillis: 600000,
} as const;
export const TOPAZ_NON_FILTER_OPTION_KEYS = [
  'source',
  'output',
  'additionalFilters',
  'filter',
] as const satisfies ReadonlyArray<keyof TopazVideoModelOptions>;
const proteusOptions = [
  'videoType',
  'auto',
  'fieldOrder',
  'focusFixLevel',
  'compression',
  'details',
  'prenoise',
  'noise',
  'halo',
  'preblur',
  'blur',
  'grain',
  'grainSigma',
  'grainSize',
  'grainType',
  'recoverOriginalDetailValue',
] as const satisfies ReadonlyArray<keyof TopazVideoModelOptions>;
const starlightOptions = [
  'sharpness',
  'videoBitDepth',
  'videoCodec',
  'videoProfile',
  'watermark',
] as const satisfies ReadonlyArray<keyof TopazVideoModelOptions>;
export function getTopazImageModelEntry(modelId: string) {
  const apiModelId = topazImageApiModelIds[modelId] ?? modelId;
  const known = Object.values(topazImageApiModelIds).includes(apiModelId);
  return {
    capabilities: { image: topazImageCapabilities },
    providerOptions: {
      image: Object.fromEntries(
        Object.keys(topazProviderOptions.image).map(
          key => [key, known ? true : 'unknown'] as const,
        ),
      ),
    },
    requestConfig: { image: { apiModelId, ...topazImageRequestDefaults } },
  } as const satisfies ModelEntry<{
    image: {
      apiModelId: string;
      pollIntervalMillis: number;
      pollTimeoutMillis: number;
    };
  }>;
}
export function getTopazVideoModelEntry(modelId: string) {
  const apiModelId = topazVideoApiModelIds[modelId] ?? modelId;
  const proteus = apiModelId === topazVideoApiModelIds.proteus;
  const starlight =
    apiModelId === topazVideoApiModelIds['starlight-precise-2.6'];
  const known = proteus || starlight;
  return {
    capabilities: { video: topazVideoCapabilities },
    providerOptions: {
      video: {
        ...Object.fromEntries(
          Object.keys(topazProviderOptions.video).map(
            key => [key, known ? true : 'unknown'] as const,
          ),
        ),
        ...Object.fromEntries(
          proteusOptions.map(
            key => [key, known ? proteus : 'unknown'] as const,
          ),
        ),
        ...Object.fromEntries(
          starlightOptions.map(
            key => [key, known ? starlight : 'unknown'] as const,
          ),
        ),
        filter: {
          condition:
            'Overrides typed filter settings, including model selection; support depends on the resulting model.',
        },
      },
    },
    requestConfig: { video: { apiModelId } },
  } as const satisfies ModelEntry<{ video: { apiModelId: string } }>;
}

export const topazModelCatalog: Record<
  string,
  ModelEntry<Record<string, unknown>>
> = {};
for (const id of topazImageModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getTopazImageModelEntry(id);
  const previous = topazModelCatalog[id];
  topazModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}
for (const id of topazVideoModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getTopazVideoModelEntry(id);
  const previous = topazModelCatalog[id];
  topazModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}

/** Known model IDs, derived from the declarations used to build the catalog. */
export type TopazModelIds = {
  image: (typeof topazImageModelIds)[number];
  video: (typeof topazVideoModelIds)[number];
};
