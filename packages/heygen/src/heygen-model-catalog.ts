import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { HeyGenVideoModelOptions } from './heygen-video-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const heyGenProviderOptions = {
  video: {
    mode: {
      description:
        'Inferred from the supplied image and references when omitted.',
    },
    resolution: {
      description:
        'Output size class. Takes precedence over the standard resolution option.',
    },
    promptEnhancement: {
      description:
        'Defaults to quality. Use disabled to preserve the original prompt.',
    },
    image: {
      description:
        'First frame, including an existing HeyGen asset. Cannot be combined with a standard image.',
    },
    referenceImages: {
      description:
        'Additional references, appended after standard inputReferences of the same kind.',
    },
    referenceVideos: { description: 'referenceVideos' },
    referenceAudio: { description: 'referenceAudio' },
  } satisfies Record<keyof HeyGenVideoModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

const videoModelIds = ['heygen-video-1'] as const;
export function getHeyGenVideoModelEntry(_modelId: string) {
  return {
    capabilities: {
      video: {
        inputs: {
          text: true,
          image: true,
          firstFrame: true,
          lastFrame: false,
          referenceImage: true,
          referenceVideo: true,
        },
        generateAudio: {
          condition: 'Audio is always generated; disabling it is unsupported.',
        },
        aspectRatio: {
          condition: 'Supported outside reference-to-video mode.',
        },
        resolution: { condition: 'Supported outside reference-to-video mode.' },
        duration: true,
        fps: { condition: 'Fixed at 24 fps.' },
        seed: true,
        maxVideosPerCall: 1,
      },
    },
    providerOptions: {
      video: Object.fromEntries(
        Object.keys(heyGenProviderOptions.video).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const heyGenModelCatalog = Object.fromEntries([
  ...videoModelIds.map(id => [id, getHeyGenVideoModelEntry(id)] as const),
]);
