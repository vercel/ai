import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { ReplicateImageModelOptions } from './replicate-image-model-options';
import type { ReplicateVideoModelOptions } from './replicate-video-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const replicateProviderOptions = {
  image: {
    maxWaitTimeInSeconds: {
      description:
        'Maximum time in seconds to wait for the prediction to complete in sync mode. By default, Replicate uses sync mode with a 60-second timeout. - When not specified: Uses default 60-second sync wait (`prefer: wait`) - When set to a positive number: Uses that duration (`prefer: wait=N`)',
    },
    pollIntervalMillis: {
      description:
        'Interval in milliseconds between polling attempts when the prediction does not complete within the synchronous wait duration. Defaults to 500 milliseconds.',
    },
    maxPollAttempts: {
      description:
        'Maximum number of polling attempts before giving up. Defaults to 240 attempts.',
    },
    guidance_scale: {
      description:
        'Guidance scale for classifier-free guidance. Higher values make the output more closely match the prompt.',
    },
    num_inference_steps: {
      description:
        'Number of denoising steps. More steps = higher quality but slower.',
    },
    negative_prompt: {
      description: 'Negative prompt to guide what to avoid in the generation.',
    },
    output_format: { description: 'Output image format.' },
    output_quality: {
      description:
        'Output image quality (1-100). Only applies to jpg and webp.',
    },
    strength: {
      description:
        'Strength of the transformation for img2img (0-1). Lower values keep more of the original image.',
    },
  } satisfies Record<
    keyof ReplicateImageModelOptions,
    ProviderOptionDefinition
  >,
  video: {
    pollIntervalMs: { description: 'pollIntervalMs' },
    pollTimeoutMs: { description: 'pollTimeoutMs' },
    maxWaitTimeInSeconds: {
      description:
        'Maximum time in seconds to wait for the prediction to complete in sync mode. By default, Replicate uses sync mode with a 60-second timeout. - When not specified: Uses default 60-second sync wait (`prefer: wait`) - When set to a positive number: Uses that duration (`prefer: wait=N`)',
    },
    guidance_scale: {
      description:
        'Guidance scale for classifier-free guidance. Higher values make the output more closely match the prompt.',
    },
    num_inference_steps: {
      description:
        'Number of denoising steps. More steps = higher quality but slower.',
    },
    motion_bucket_id: { description: 'motion_bucket_id' },
    cond_aug: { description: 'cond_aug' },
    decoding_t: { description: 'decoding_t' },
    video_length: { description: 'video_length' },
    sizing_strategy: { description: 'sizing_strategy' },
    frames_per_second: { description: 'frames_per_second' },
    prompt_optimizer: { description: 'prompt_optimizer' },
  } satisfies Record<
    keyof ReplicateVideoModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

const imageModelIds = [
  'black-forest-labs/flux-1.1-pro',
  'black-forest-labs/flux-1.1-pro-ultra',
  'black-forest-labs/flux-dev',
  'black-forest-labs/flux-pro',
  'black-forest-labs/flux-schnell',
  'bytedance/sdxl-lightning-4step',
  'fofr/aura-flow',
  'fofr/latent-consistency-model',
  'fofr/realvisxl-v3-multi-controlnet-lora',
  'fofr/sdxl-emoji',
  'fofr/sdxl-multi-controlnet-lora',
  'ideogram-ai/ideogram-v2',
  'ideogram-ai/ideogram-v2-turbo',
  'lucataco/dreamshaper-xl-turbo',
  'lucataco/open-dalle-v1.1',
  'lucataco/realvisxl-v2.0',
  'lucataco/realvisxl2-lcm',
  'luma/photon',
  'luma/photon-flash',
  'nvidia/sana',
  'playgroundai/playground-v2.5-1024px-aesthetic',
  'recraft-ai/recraft-v3',
  'recraft-ai/recraft-v3-svg',
  'stability-ai/stable-diffusion-3.5-large',
  'stability-ai/stable-diffusion-3.5-large-turbo',
  'stability-ai/stable-diffusion-3.5-medium',
  'tstramer/material-diffusion',
  'black-forest-labs/flux-fill-pro',
  'black-forest-labs/flux-fill-dev',
  'black-forest-labs/flux-2-pro',
  'black-forest-labs/flux-2-dev',
] as const;
const videoModelIds = [
  'minimax/video-01',
  'minimax/video-01:6c1e4171-288a-4ca2-a738-894f0e87699d',
  'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438',
] as const;
const FLUX_2_MODEL_PATTERN = /^black-forest-labs\/flux-2-/;
export const MAX_FLUX_2_INPUT_IMAGES = 8;
export function getReplicateImageModelEntry(modelId: string) {
  const isFlux2Model = ((): boolean => {
    return FLUX_2_MODEL_PATTERN.test(modelId);
  })();
  const supportsFileInputs = ((): boolean | undefined => {
    if (
      modelId === 'black-forest-labs/flux-2-pro' ||
      modelId === 'black-forest-labs/flux-2-dev' ||
      modelId === 'black-forest-labs/flux-fill-pro' ||
      modelId === 'black-forest-labs/flux-fill-dev'
    ) {
      return true;
    }

    return undefined;
  })();
  const supportsMaskInputs = ((): boolean | undefined => {
    if (
      modelId === 'black-forest-labs/flux-fill-pro' ||
      modelId === 'black-forest-labs/flux-fill-dev'
    ) {
      return true;
    }

    return supportsFileInputs === true ? false : undefined;
  })();
  const maxImagesPerCall = ((): number => {
    // Flux-2 models support up to 8 input images
    return isFlux2Model ? MAX_FLUX_2_INPUT_IMAGES : 1;
  })();
  const entry = {
    capabilities: {
      image: {
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
        Object.keys(replicateProviderOptions.image).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { image: { isFlux2Model } },
  } as const;
  return entry satisfies ModelEntry<{ image: { isFlux2Model: boolean } }>;
}
export function getReplicateVideoModelEntry(_modelId: string) {
  return {
    capabilities: {
      video: {
        inputs: {
          text: true,
          image: { condition: 'Supported by the selected model.' },
          firstFrame: false,
          lastFrame: false,
          referenceImage: false,
          referenceVideo: false,
        },
        generateAudio: false,
        aspectRatio: { condition: 'Supported by the selected model.' },
        resolution: { condition: 'Supported by the selected model.' },
        duration: { condition: 'Supported by the selected model.' },
        fps: { condition: 'Supported by the selected model.' },
        seed: { condition: 'Supported by the selected model.' },
        maxVideosPerCall: undefined,
      },
    },
    providerOptions: {
      video: Object.fromEntries(
        Object.keys(replicateProviderOptions.video).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export const replicateModelCatalog = Object.fromEntries([
  ...imageModelIds.map(id => [id, getReplicateImageModelEntry(id)] as const),
  ...videoModelIds.map(id => [id, getReplicateVideoModelEntry(id)] as const),
]);
