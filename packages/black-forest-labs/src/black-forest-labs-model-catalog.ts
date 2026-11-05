import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { BlackForestLabsImageModelOptions } from './black-forest-labs-image-model-options';
import type { BlackForestLabsVideoModelOptions } from './black-forest-labs-video-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const blackForestLabsProviderOptions = {
  image: {
    resolution: { description: 'resolution' },
    grounding: { description: 'grounding' },
    version: { description: 'version' },
    imagePrompt: { description: 'imagePrompt' },
    imagePromptStrength: { description: 'imagePromptStrength' },
    inputImage: { description: 'inputImage' },
    inputImage2: { description: 'inputImage2' },
    inputImage3: { description: 'inputImage3' },
    inputImage4: { description: 'inputImage4' },
    inputImage5: { description: 'inputImage5' },
    inputImage6: { description: 'inputImage6' },
    inputImage7: { description: 'inputImage7' },
    inputImage8: { description: 'inputImage8' },
    inputImage9: { description: 'inputImage9' },
    inputImage10: { description: 'inputImage10' },
    steps: { description: 'steps' },
    guidance: { description: 'guidance' },
    width: { description: 'width' },
    height: { description: 'height' },
    outputFormat: { description: 'outputFormat' },
    promptUpsampling: { description: 'promptUpsampling' },
    raw: { description: 'raw' },
    safetyTolerance: { description: 'safetyTolerance' },
    webhookSecret: { description: 'webhookSecret' },
    webhookUrl: { description: 'webhookUrl' },
    pollIntervalMillis: { description: 'pollIntervalMillis' },
    pollTimeoutMillis: { description: 'pollTimeoutMillis' },
  } satisfies Record<
    keyof BlackForestLabsImageModelOptions,
    ProviderOptionDefinition
  >,
  video: {
    resolution: {
      description:
        'Output resolution tier. Takes precedence over the top-level `resolution`, which is expressed as `{width}x{height}` and has to be mapped onto a tier.',
    },
    aspectRatio: {
      description:
        'Aspect ratio of the generated video. Takes precedence over the top-level `aspectRatio`, and unlike it can be set to `auto`.',
    },
    keyframes: {
      description:
        'Keyframes for image-to-video generation, for the shapes the top-level `image` and `frameImages` options cannot express: more than two images, or images pinned to a specific second. Takes precedence over both. One image opens the clip, two open and close it, and with more the extras are spaced evenly in between. Three or more plain images require an explicit `duration`.',
    },
    safetyTolerance: {
      description:
        'Moderation strictness from 0 (strictest) to 4. Defaults to 2. Sexual content is capped at 3 and hate content at 2 regardless of the request, and any request carrying conditioning media is capped at 2.',
    },
    draft: {
      description:
        'Render a fast, lower-quality preview instead of the finished video. Defaults to `false`.',
    },
    draftCache: {
      description:
        "Encrypted draft-cache bundle from a prior `draft` generation, which switches the request to draft-enhance mode: the bundle is replayed at full quality. Either the base64-encoded `.bin` downloaded from the draft's `draftCache` URL, or that URL itself while it is still in its expiry window.",
    },
    version: {
      description: 'Model version to pin. Only `latest` is available today.',
    },
  } satisfies Record<
    keyof BlackForestLabsVideoModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const imageModelIds = [
  'flux-3-image',
  'flux-3-image-klein',
  'flux-kontext-pro',
  'flux-kontext-max',
  'flux-pro-1.1-ultra',
  'flux-pro-1.1',
  'flux-pro-1.0-fill',
] as const;
const videoModelIds = ['flux-3-video'] as const;
const imageDescriptions: Partial<Record<string, { description: string }>> = {
  'flux-3-image': {
    description:
      'FLUX 3 for text-to-image and editing with up to ten reference images and optional web grounding',
  },
  'flux-3-image-klein': {
    description:
      'FLUX 3 Image Klein for fast generation and editing, with open weights and exact output dimensions',
  },
  'flux-2-pro': {
    description:
      'FLUX.2 [pro] for text-to-image and reference-based editing in one endpoint',
  },
  'flux-2-max': {
    description:
      'FLUX.2 [max] for the highest prompt adherence and detail in the FLUX.2 family',
  },
  'flux-2-flex': {
    description:
      'FLUX.2 [flex] exposes `steps` and `guidance` so you can trade speed against quality',
  },
  'flux-2-klein-9b': {
    description: 'FLUX.2 [klein] 9B, an open-weight distilled model',
  },
  'flux-2-klein-4b': {
    description:
      'FLUX.2 [klein] 4B, the smallest and cheapest open-weight FLUX.2 model',
  },
  'flux-kontext-pro': {
    description:
      'FLUX.1 Kontext [pro] handles both text and reference images as inputs, enabling targeted edits and complex transformations',
  },
  'flux-kontext-max': {
    description:
      'FLUX.1 Kontext [max] with improved prompt adherence and typography generation',
  },
  'flux-pro-1.1-ultra': {
    description: 'Ultra-fast, ultra high-resolution image creation',
  },
  'flux-pro-1.1': {
    description: 'Fast, high-quality image generation from text.',
  },
  'flux-pro-1.0-fill': {
    description:
      'Inpainting model for filling masked regions of images with new content',
  },
};
const videoDescriptions: Partial<Record<string, { description: string }>> = {
  'flux-3-video': {
    description:
      'Up to full-HD and 20 seconds, with synchronized audio. Text-to-video, keyframes, and video continuation.',
  },
};
export function getBlackForestLabsImageModelEntry(modelId: string) {
  const modelApi = ((): 'legacy' | 'flux-3-image' | 'latest' => {
    if (
      modelId === 'flux-pro' ||
      modelId === 'flux-dev' ||
      modelId.startsWith('flux-pro-') ||
      modelId.startsWith('flux-kontext-') ||
      /^flux-[12](?:[.-]|$)/.test(modelId)
    ) {
      return 'legacy';
    }

    if (modelId === 'flux-3-image') {
      return 'flux-3-image';
    }

    // Unknown model IDs inherit the latest supported image API.
    return 'latest';
  })();
  const supportsFileInputs = ((): boolean | undefined => {
    if (
      modelApi !== 'legacy' ||
      ['flux-kontext-pro', 'flux-kontext-max', 'flux-pro-1.0-fill'].includes(
        modelId,
      )
    ) {
      return true;
    }

    if (['flux-pro-1.1-ultra', 'flux-pro-1.1'].includes(modelId)) {
      return false;
    }

    return undefined;
  })();
  const supportsMaskInputs = ((): boolean | undefined => {
    if (modelId === 'flux-pro-1.0-fill') {
      return true;
    }

    return supportsFileInputs == null ? undefined : false;
  })();
  const maxImagesPerCall = 1;
  const entry = {
    capabilities: {
      image: {
        ...imageDescriptions[modelId],
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
        Object.keys(blackForestLabsProviderOptions.image).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: {
      image: {
        modelApi,
        inputImageKey:
          modelId === 'flux-pro-1.0-fill' ? 'image' : 'input_image',
      },
    },
  } as const;
  return entry satisfies ModelEntry<{
    image: { modelApi: 'legacy' | 'flux-3-image' | 'latest' };
  }>;
}
export function getBlackForestLabsVideoModelEntry(modelId: string) {
  return {
    capabilities: {
      video: {
        ...videoDescriptions[modelId],
        inputs: {
          text: true,
          image: true,
          firstFrame: true,
          lastFrame: true,
          referenceImage: false,
          referenceVideo: true,
        },
        generateAudio: true,
        aspectRatio: true,
        resolution: true,
        duration: true,
        fps: false,
        seed: false,
        maxVideosPerCall: 1,
      },
    },
    providerOptions: {
      video: Object.fromEntries(
        Object.keys(blackForestLabsProviderOptions.video).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const blackForestLabsModelCatalog = Object.fromEntries([
  ...imageModelIds.map(
    id => [id, getBlackForestLabsImageModelEntry(id)] as const,
  ),
  ...videoModelIds.map(
    id => [id, getBlackForestLabsVideoModelEntry(id)] as const,
  ),
]);

Object.assign(
  blackForestLabsModelCatalog,
  Object.fromEntries(
    Object.keys(imageDescriptions).map(id => [
      id,
      getBlackForestLabsImageModelEntry(id),
    ]),
  ),
);
