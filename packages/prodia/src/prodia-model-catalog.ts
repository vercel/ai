import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { ProdiaImageModelOptions } from './prodia-image-model-options';
import type { ProdiaLanguageModelOptions } from './prodia-language-model-options';
import type { ProdiaVideoModelOptions } from './prodia-video-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const prodiaProviderOptions = {
  image: {
    steps: {
      description:
        'Amount of computational iterations to run. More is typically higher quality.',
    },
    width: { description: 'Width of the output image in pixels.' },
    height: { description: 'Height of the output image in pixels.' },
    stylePreset: { description: 'Apply a visual theme to your output image.' },
    loras: { description: 'Augment the output with a LoRa model.' },
    progressive: {
      description: 'When using JPEG output, return a progressive JPEG.',
    },
  } satisfies Record<keyof ProdiaImageModelOptions, ProviderOptionDefinition>,
  language: {
    aspectRatio: { description: 'Aspect ratio for the output image.' },
  } satisfies Record<
    keyof ProdiaLanguageModelOptions,
    ProviderOptionDefinition
  >,
  video: {
    resolution: { description: 'Video resolution (e.g. "480p", "720p").' },
  } satisfies Record<keyof ProdiaVideoModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

const imageModelIds = [
  'inference.flux-fast.schnell.txt2img.v2',
  'inference.flux.schnell.txt2img.v2',
] as const;
const languageModelIds = ['inference.nano-banana.img2img.v2'] as const;
const videoModelIds = [
  'inference.wan2-2.lightning.txt2vid.v0',
  'inference.wan2-2.lightning.img2vid.v0',
] as const;
const imageDescriptions: Partial<Record<string, { description: string }>> = {
  'inference.flux-fast.schnell.txt2img.v2': {
    description: 'Fast FLUX Schnell model for text-to-image generation',
  },
  'inference.flux.schnell.txt2img.v2': {
    description: 'FLUX Schnell model for text-to-image generation',
  },
};
export function getProdiaImageModelEntry(modelId: string) {
  const entry = {
    capabilities: {
      image: {
        ...imageDescriptions[modelId],
        sizes: {
          description:
            'Output width and height in pixels, configured with size or providerOptions.prodia.',
        },
        fileInput: false,
        maskInput: false,
        maxImagesPerCall: 1,
      },
    },
    providerOptions: {
      image: Object.fromEntries(
        Object.keys(prodiaProviderOptions.image).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } as const;
  return entry satisfies ModelEntry;
}
export function getProdiaLanguageModelEntry(_modelId: string) {
  const entry = {
    capabilities: {
      language: {
        inputs: { image: true, audio: false },
        objectGeneration: false,
        tools: { usage: false, streaming: false },
        reasoning: { support: false },
        sampling: { temperature: false, topP: false, logprobs: false },
        textGeneration: false,
        imageGeneration: true,
      },
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(prodiaProviderOptions.language).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } as const;
  return entry satisfies ModelEntry;
}
export function getProdiaVideoModelEntry(modelId: string) {
  return {
    capabilities: {
      video: {
        inputs: {
          text: true,
          image:
            modelId === 'inference.wan2-2.lightning.img2vid.v0'
              ? true
              : modelId === 'inference.wan2-2.lightning.txt2vid.v0'
                ? false
                : 'unknown',
          firstFrame: false,
          lastFrame: false,
          referenceImage: false,
          referenceVideo: false,
        },
        generateAudio: false,
        aspectRatio: false,
        resolution: {
          condition: 'Configured through providerOptions.prodia.resolution.',
        },
        duration: false,
        fps: false,
        seed: true,
        maxVideosPerCall: 1,
      },
    },
    providerOptions: {
      video: Object.fromEntries(
        Object.keys(prodiaProviderOptions.video).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const prodiaModelCatalog = Object.fromEntries([
  ...imageModelIds.map(id => [id, getProdiaImageModelEntry(id)] as const),
  ...languageModelIds.map(id => [id, getProdiaLanguageModelEntry(id)] as const),
  ...videoModelIds.map(id => [id, getProdiaVideoModelEntry(id)] as const),
]);
