import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { FalImageModelOptions } from './fal-image-model-options';
import type { FalSpeechModelOptions } from './fal-speech-model-options';
import type { FalTranscriptionModelOptions } from './fal-transcription-model-options';
import type { FalVideoModelOptions } from './fal-video-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const falProviderOptions = {
  image: {
    imageUrl: { description: 'imageUrl' },
    maskUrl: { description: 'maskUrl' },
    guidanceScale: { description: 'guidanceScale' },
    numInferenceSteps: { description: 'numInferenceSteps' },
    enableSafetyChecker: { description: 'enableSafetyChecker' },
    outputFormat: { description: 'outputFormat' },
    syncMode: { description: 'syncMode' },
    strength: { description: 'strength' },
    acceleration: { description: 'acceleration' },
    safetyTolerance: { description: 'safetyTolerance' },
    useMultipleImages: {
      description:
        'When true, converts multiple input images to `image_urls` array instead of `image_url` string.',
    },
    image_url: { description: 'image_url' },
    mask_url: { description: 'mask_url' },
    guidance_scale: { description: 'guidance_scale' },
    num_inference_steps: { description: 'num_inference_steps' },
    enable_safety_checker: { description: 'enable_safety_checker' },
    output_format: { description: 'output_format' },
    sync_mode: { description: 'sync_mode' },
    safety_tolerance: { description: 'safety_tolerance' },
  } satisfies Record<keyof FalImageModelOptions, ProviderOptionDefinition>,
  speech: {
    voice_setting: { description: 'voice_setting' },
    audio_setting: { description: 'audio_setting' },
    language_boost: { description: 'language_boost' },
    pronunciation_dict: { description: 'pronunciation_dict' },
  } satisfies Record<keyof FalSpeechModelOptions, ProviderOptionDefinition>,
  transcription: {
    language: {
      description:
        'Language of the audio file. If set to null, the language will be automatically detected. Defaults to null. If translate is selected as the task, the audio will be translated to English, regardless of the language selected.',
    },
    diarize: {
      description: 'Whether to diarize the audio file. Defaults to true.',
    },
    chunkLevel: {
      description:
        'Level of the chunks to return. Either segment or word. Default value: "segment"',
    },
    version: {
      description:
        'Version of the model to use. All of the models are the Whisper large variant. Default value: "3"',
    },
    batchSize: { description: 'Default value: 64' },
    numSpeakers: {
      description:
        'Number of speakers in the audio file. Defaults to null. If not provided, the number of speakers will be automatically detected.',
    },
  } satisfies Record<
    keyof FalTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
  video: {
    loop: { description: 'loop' },
    motionStrength: { description: 'motionStrength' },
    resolution: { description: 'resolution' },
    negativePrompt: { description: 'negativePrompt' },
    promptOptimizer: { description: 'promptOptimizer' },
  } satisfies Record<keyof FalVideoModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

const imageModelIds = [
  'fal-ai/aura-sr',
  'fal-ai/bria/background/remove',
  'fal-ai/bria/eraser',
  'fal-ai/bria/product-shot',
  'fal-ai/bria/reimagine',
  'bria/text-to-image/3.2',
  'fal-ai/bria/text-to-image/base',
  'fal-ai/bria/text-to-image/fast',
  'fal-ai/bria/text-to-image/hd',
  'fal-ai/bytedance/dreamina/v3.1/text-to-image',
  'fal-ai/ccsr',
  'fal-ai/clarity-upscaler',
  'fal-ai/creative-upscaler',
  'fal-ai/esrgan',
  'fal-ai/flux-general',
  'fal-ai/flux-general/differential-diffusion',
  'fal-ai/flux-general/image-to-image',
  'fal-ai/flux-general/inpainting',
  'fal-ai/flux-general/rf-inversion',
  'fal-ai/flux-kontext-lora/text-to-image',
  'fal-ai/flux-lora',
  'fal-ai/flux-lora/image-to-image',
  'fal-ai/flux-lora/inpainting',
  'fal-ai/flux-pro/kontext',
  'fal-ai/flux-pro/kontext/max',
  'fal-ai/flux-pro/v1.1',
  'fal-ai/flux-pro/v1.1-ultra',
  'fal-ai/flux-pro/v1.1-ultra-finetuned',
  'fal-ai/flux-pro/v1.1-ultra/redux',
  'fal-ai/flux-pro/v1.1/redux',
  'fal-ai/flux/dev',
  'fal-ai/flux/dev/image-to-image',
  'fal-ai/flux/dev/redux',
  'fal-ai/flux/krea',
  'fal-ai/flux/krea/image-to-image',
  'fal-ai/flux/krea/redux',
  'fal-ai/flux/schnell',
  'fal-ai/flux/schnell/redux',
  'fal-ai/ideogram/character',
  'fal-ai/ideogram/character/edit',
  'fal-ai/ideogram/character/remix',
  'fal-ai/imagen4/preview',
  'fal-ai/luma-photon',
  'fal-ai/luma-photon/flash',
  'fal-ai/object-removal',
  'fal-ai/omnigen-v2',
  'fal-ai/qwen-image',
  'fal-ai/recraft/v3/text-to-image',
  'fal-ai/recraft/v3/image-to-image',
  'fal-ai/sana/sprint',
  'fal-ai/sana/v1.5/4.8b',
  'fal-ai/sana/v1.5/1.6b',
  'fal-ai/sky-raccoon',
  'fal-ai/wan/v2.2-5b/text-to-image',
  'fal-ai/wan/v2.2-a14b/text-to-image',
  'fal-ai/fashn/tryon/v1.6',
] as const;
const speechModelIds = [
  'fal-ai/minimax/voice-clone',
  'fal-ai/minimax/voice-design',
  'fal-ai/dia-tts/voice-clone',
  'fal-ai/minimax/speech-02-hd',
  'fal-ai/minimax/speech-02-turbo',
  'fal-ai/dia-tts',
  'resemble-ai/chatterboxhd/text-to-speech',
] as const;
const transcriptionModelIds = ['whisper', 'wizper'] as const;
const videoModelIds = [
  'luma-dream-machine',
  'luma-ray-2',
  'luma-ray-2-flash',
  'minimax-video',
  'minimax-video-01',
  'hunyuan-video',
] as const;
const imageDescriptions: Partial<Record<string, { description: string }>> = {
  'fal-ai/flux/dev': {
    description: 'FLUX.1 [dev] model for high-quality image generation',
  },
  'fal-ai/flux-pro/kontext': {
    description:
      'FLUX.1 Kontext [pro] handles both text and reference images as inputs, enabling targeted edits and complex transformations',
  },
  'fal-ai/flux-pro/kontext/max': {
    description:
      'FLUX.1 Kontext [max] with improved prompt adherence and typography generation',
  },
  'fal-ai/flux-lora': {
    description: 'Super fast endpoint for FLUX.1 with LoRA support',
  },
  'fal-ai/ideogram/character': {
    description:
      'Generate consistent character appearances across multiple images. Maintain facial features, proportions, and distinctive traits',
  },
  'fal-ai/qwen-image': {
    description:
      'Qwen-Image foundation model with significant advances in complex text rendering and precise image editing',
  },
  'fal-ai/omnigen-v2': {
    description:
      'Unified image generation model for Image Editing, Personalized Image Generation, Virtual Try-On, Multi Person Generation and more',
  },
  'fal-ai/bytedance/dreamina/v3.1/text-to-image': {
    description:
      'Dreamina showcases superior picture effects with improvements in aesthetics, precise and diverse styles, and rich details',
  },
  'fal-ai/recraft/v3/text-to-image': {
    description:
      'SOTA in image generation with vector art and brand style capabilities',
  },
  'fal-ai/wan/v2.2-a14b/text-to-image': {
    description:
      'High-resolution, photorealistic images with fine-grained detail',
  },
};
const speechDescriptions: Partial<Record<string, { description: string }>> = {
  'fal-ai/minimax/voice-clone': {
    description:
      'Clone a voice from a sample audio and generate speech from text prompts',
  },
  'fal-ai/minimax/voice-design': {
    description:
      'Design a personalized voice from a text description and generate speech from text prompts',
  },
  'fal-ai/dia-tts/voice-clone': {
    description:
      'Clone dialog voices from a sample audio and generate dialogs from text prompts',
  },
  'fal-ai/minimax/speech-02-hd': {
    description: 'Generate speech from text prompts and different voices',
  },
  'fal-ai/minimax/speech-02-turbo': {
    description: 'Generate fast speech from text prompts and different voices',
  },
  'fal-ai/dia-tts': {
    description:
      'Directly generates realistic dialogue from transcripts with audio conditioning for emotion control. Produces natural nonverbals like laughter and throat clearing',
  },
  'resemble-ai/chatterboxhd/text-to-speech': {
    description:
      "Generate expressive, natural speech with Resemble AI's Chatterbox. Features unique emotion control, instant voice cloning from short audio, and built-in watermarking",
  },
};
export function getFalImageModelEntry(modelId: string) {
  const supportsFileInputs = ((): boolean | undefined => {
    if (
      [
        'fal-ai/flux-2/edit',
        'fal-ai/flux-pro/kontext',
        'fal-ai/flux-pro/kontext/max',
        'fal-ai/flux-general/image-to-image',
        'fal-ai/flux-general/inpainting',
        'fal-ai/flux-lora/image-to-image',
        'fal-ai/flux-lora/inpainting',
        'fal-ai/flux/dev/image-to-image',
        'fal-ai/flux/krea/image-to-image',
        'fal-ai/recraft/v3/image-to-image',
      ].includes(modelId)
    ) {
      return true;
    }

    return [
      'bria/text-to-image/3.2',
      'fal-ai/bria/text-to-image/base',
      'fal-ai/bria/text-to-image/fast',
      'fal-ai/bria/text-to-image/hd',
      'fal-ai/bytedance/dreamina/v3.1/text-to-image',
      'fal-ai/flux-kontext-lora/text-to-image',
      'fal-ai/recraft/v3/text-to-image',
      'fal-ai/wan/v2.2-5b/text-to-image',
      'fal-ai/wan/v2.2-a14b/text-to-image',
    ].includes(modelId)
      ? false
      : undefined;
  })();
  const supportsMaskInputs = ((): boolean | undefined => {
    if (
      modelId === 'fal-ai/flux-general/inpainting' ||
      modelId === 'fal-ai/flux-lora/inpainting'
    ) {
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
        Object.keys(falProviderOptions.image).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { image: {} },
  } as const;
  return entry satisfies ModelEntry<{ image: {} }>;
}
export function getFalSpeechModelEntry(modelId: string) {
  return {
    capabilities: {
      speech: { ...speechDescriptions[modelId], instructions: false },
    },
    providerOptions: {
      speech: Object.fromEntries(
        Object.keys(falProviderOptions.speech).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export function getFalTranscriptionModelEntry(_modelId: string) {
  return {
    capabilities: {
      transcription: {
        transcription: true,
        streaming: false,
        duration: true,
        segments: true,
        language: true,
      },
    },
    providerOptions: {
      transcription: Object.fromEntries(
        Object.keys(falProviderOptions.transcription).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
  } satisfies ModelEntry;
}
export function getFalVideoModelEntry(modelId: string) {
  return {
    capabilities: {
      video: {
        inputs: {
          text: true,
          image: { condition: 'Supported by the selected model endpoint.' },
          firstFrame: false,
          lastFrame: false,
          referenceImage: false,
          referenceVideo: false,
        },
        generateAudio: false,
        aspectRatio: { condition: 'Supported by the selected model endpoint.' },
        resolution: {
          condition: 'Configured with providerOptions.fal.resolution.',
        },
        duration: { condition: 'Supported by the selected model endpoint.' },
        fps: false,
        seed: { condition: 'Supported by the selected model endpoint.' },
        maxVideosPerCall: undefined,
      },
    },
    providerOptions: {
      video: Object.fromEntries(
        Object.keys(falProviderOptions.video).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: {
      video: {
        normalizedModelId: modelId
          .replace(/^fal-ai\//, '')
          .replace(/^fal\//, ''),
      },
    },
  } satisfies ModelEntry<{ video: { normalizedModelId: string } }>;
}
export const falModelCatalog = Object.fromEntries([
  ...imageModelIds.map(id => [id, getFalImageModelEntry(id)] as const),
  ...speechModelIds.map(id => [id, getFalSpeechModelEntry(id)] as const),
  ...transcriptionModelIds.map(
    id => [id, getFalTranscriptionModelEntry(id)] as const,
  ),
  ...videoModelIds.map(id => [id, getFalVideoModelEntry(id)] as const),
]);

Object.assign(
  falModelCatalog,
  Object.fromEntries(
    Object.keys(imageDescriptions).map(id => [id, getFalImageModelEntry(id)]),
  ),
);

falModelCatalog['fal-ai/flux-2/edit'] =
  getFalImageModelEntry('fal-ai/flux-2/edit');
