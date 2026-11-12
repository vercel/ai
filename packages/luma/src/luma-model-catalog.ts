import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { LumaImageModelOptions } from './luma-image-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const lumaProviderOptions = {
  image: {
    referenceType: {
      description:
        'The type of image reference to use when providing input images. - `image`: Guide generation using reference images (up to 4). Default. - `style`: Apply a specific style from reference image(s). - `character`: Create consistent characters from reference images (up to 4). - `modify_image`: Transform a single input image with prompt guidance.',
    },
    images: {
      description:
        'Per-image configuration array. Each entry corresponds to an image in `prompt.images`. Allows setting individual weights for each reference image.',
    },
    pollIntervalMillis: {
      description:
        'Override the polling interval in milliseconds (default 500).',
    },
    maxPollAttempts: {
      description:
        'Override the maximum number of polling attempts (default 120).',
    },
  } satisfies Record<keyof LumaImageModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

const imageModelIds = ['photon-1', 'photon-flash-1'] as const;
const imageDescriptions: Partial<Record<string, { description: string }>> = {
  'photon-1': {
    description:
      'High-quality image generation with superior prompt understanding',
  },
  'photon-flash-1': {
    description:
      'Faster generation optimized for speed while maintaining quality',
  },
};
export function getLumaImageModelEntry(modelId: string) {
  const supportsFileInputs = ((): boolean | undefined => {
    return modelId === 'photon-1' || modelId === 'photon-flash-1'
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
        Object.keys(lumaProviderOptions.image).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { image: {} },
  } as const;
  return entry satisfies ModelEntry<{ image: {} }>;
}
export const lumaModelCatalog = Object.fromEntries([
  ...imageModelIds.map(id => [id, getLumaImageModelEntry(id)] as const),
]);

Object.assign(
  lumaModelCatalog,
  Object.fromEntries(
    Object.keys(imageDescriptions).map(id => [id, getLumaImageModelEntry(id)]),
  ),
);
