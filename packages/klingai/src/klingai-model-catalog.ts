import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { KlingAIVideoModelOptions } from './klingai-video-model-options';
/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const klingAIProviderOptions = {
  video: {
    mode: {
      description:
        "Video generation mode. - `'std'`: Standard mode — cost-effective. - `'pro'`: Professional mode — higher quality but longer generation time.",
    },
    pollIntervalMs: {
      description:
        'Polling interval in milliseconds for checking task status. Default: 5000 (5 seconds).',
    },
    pollTimeoutMs: {
      description:
        'Maximum time in milliseconds to wait for video generation. Default: 600000 (10 minutes).',
    },
    negativePrompt: {
      description:
        'Negative text prompt to specify what to avoid. Cannot exceed 2500 characters.',
    },
    sound: {
      description:
        "Whether to generate sound simultaneously when generating videos. Only V2.6 and subsequent versions support this parameter, and requires `mode: 'pro'`.",
    },
    cfgScale: {
      description:
        "Flexibility in video generation. The higher the value, the lower the model's flexibility, and the stronger the relevance to the user's prompt. Value range: [0, 1]. Kling-v2.x models do not support this parameter.",
    },
    cameraControl: {
      description:
        'Camera movement control. If not specified, the model will intelligently match based on the input text/images.',
    },
    imageTail: {
      description:
        "End frame image for I2V start+end frame control. Supports image URL or raw base64-encoded image data. Requires `mode: 'pro'` for most models.",
    },
    staticMask: {
      description:
        'Static brush mask image for I2V motion brush. Supports image URL or raw base64-encoded image data.',
    },
    dynamicMasks: {
      description:
        'Dynamic brush configurations for I2V motion brush. Up to 6 groups, each with a mask and motion trajectories.',
    },
    multiShot: {
      description:
        "Enable multi-shot video generation (Kling v3.0+). When true, the video is split into up to 6 storyboard shots with individual prompts and durations. When multiShot is true with shotType 'customize', multiPrompt is required. When multiShot is true, the main prompt parameter is ignored by the API.",
    },
    shotType: {
      description:
        "Storyboard method for multi-shot video generation (Kling v3.0+). Required when multiShot is true. - `'customize'`: User-defined shots via multiPrompt. - `'intelligence'`: Model auto-segments based on the main prompt.",
    },
    multiPrompt: {
      description:
        "Per-shot details for multi-shot video generation (Kling v3.0+). Required when multiShot is true and shotType is 'customize'. Up to 6 shots. Each shot has an index, prompt (max 512 chars), and duration in seconds. Shot durations must sum to the total duration.",
    },
    elementList: {
      description:
        'Reference elements for element control (Kling v3.0+). Supports video character elements and multi-image elements. - I2V: Up to 3 reference elements. Cannot coexist with voiceList. - Motion Control: Currently only 1 element supported. When referencing an element, the generated video can only refer to the orientation of the person in the video.',
    },
    voiceList: {
      description:
        "Voice references for voice control (Kling v3.0+). Up to 2 voice references. Referenced via `<<<voice_1>>>` template syntax in the prompt. When voiceList is used and the prompt references voice IDs, sound must be set to 'on'. Cannot coexist with elementList on the I2V endpoint.",
    },
    watermarkEnabled: {
      description: 'Whether to generate watermarked results simultaneously.',
    },
    videoUrl: {
      description:
        'URL of the reference video. The character actions in the generated video are consistent with the reference video. Supports .mp4/.mov, max 100MB, side lengths 340px–3850px, duration 3–30 seconds (depends on `characterOrientation`).',
    },
    characterOrientation: {
      description:
        "Orientation of the characters in the generated video. - `'image'`: Same orientation as the person in the image. Reference video duration max 10 seconds. - `'video'`: Same orientation as the person in the video. Reference video duration max 30 seconds.",
    },
    keepOriginalSound: {
      description:
        "Whether to keep the original sound of the reference video. Default: `'yes'`.",
    },
  } satisfies Record<keyof KlingAIVideoModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

const videoModelIds = [
  'kling-v1-t2v',
  'kling-v1.6-t2v',
  'kling-v2-master-t2v',
  'kling-v2.1-master-t2v',
  'kling-v2.5-turbo-t2v',
  'kling-v2.6-t2v',
  'kling-v3.0-t2v',
  'kling-v1-i2v',
  'kling-v1.5-i2v',
  'kling-v1.6-i2v',
  'kling-v2-master-i2v',
  'kling-v2.1-i2v',
  'kling-v2.1-master-i2v',
  'kling-v2.5-turbo-i2v',
  'kling-v2.6-i2v',
  'kling-v3.0-i2v',
  'kling-v2.6-motion-control',
  'kling-v3.0-motion-control',
] as const;
export type KlingAIVideoMode = 't2v' | 'i2v' | 'mi2v' | 'motion-control';
const videoDescriptions: Partial<Record<string, { description: string }>> = {
  'kling-v3.0-t2v': {
    description: 'Latest v3.0, multi-shot, voice control, sound (3-15s)',
  },
  'kling-v2.6-t2v': { description: 'V2.6, sound in pro mode' },
  'kling-v2.5-turbo-t2v': { description: 'Optimized for speed, std and pro' },
  'kling-v2.1-master-t2v': { description: 'High-quality generation, pro only' },
  'kling-v2-master-t2v': { description: 'Master-quality generation' },
  'kling-v1.6-t2v': { description: 'V1.6 generation, std and pro' },
  'kling-v1-t2v': {
    description: 'Original V1 model, supports camera control (std)',
  },
  'kling-v3.0-i2v': {
    description:
      'Latest v3.0, multi-shot, element/voice control, sound (3-15s)',
  },
  'kling-v2.6-i2v': { description: 'V2.6, sound and end-frame in pro mode' },
  'kling-v2.5-turbo-i2v': {
    description: 'Optimized for speed, end-frame in pro',
  },
  'kling-v2.1-master-i2v': { description: 'High-quality generation, pro only' },
  'kling-v2.1-i2v': { description: 'V2.1 generation, end-frame in pro' },
  'kling-v2-master-i2v': { description: 'Master-quality generation' },
  'kling-v1.6-i2v': { description: 'V1.6 generation, end-frame in pro' },
  'kling-v1.5-i2v': {
    description: 'V1.5 generation, end-frame and motion brush in pro',
  },
  'kling-v1-i2v': {
    description: 'Original V1 model, end-frame and motion brush in std/pro',
  },
  'kling-v3.0-motion-control': {
    description: 'Latest v3.0, enhanced facial consistency via element binding',
  },
  'kling-v2.6-motion-control': {
    description: 'Transfers motion from a reference video to a character image',
  },
};
function resolveMode(
  modelId: string,
): Exclude<KlingAIVideoMode, 'mi2v'> | undefined {
  if (modelId.endsWith('-t2v')) return 't2v';
  if (modelId.endsWith('-i2v')) return 'i2v';
  if (modelId.endsWith('-motion-control')) return 'motion-control';
  return undefined;
}
export function getKlingAIApiModelName(
  modelId: string,
  mode: KlingAIVideoMode,
): string {
  const suffix =
    mode === 'motion-control'
      ? '-motion-control'
      : mode === 'mi2v'
        ? '-i2v'
        : '-' + mode;
  const baseName = modelId.slice(0, -suffix.length);
  return baseName.replace(/\.0$/, '').replace(/\./g, '-');
}
export function getKlingAIVideoModelEntry(modelId: string) {
  const mode = resolveMode(modelId);
  const entry = {
    capabilities: {
      video: {
        inputs: {
          text:
            mode === 'motion-control' ? false : mode == null ? 'unknown' : true,
          image: mode == null ? 'unknown' : mode !== 't2v',
          firstFrame: mode == null ? 'unknown' : mode === 'i2v',
          lastFrame:
            mode === 'i2v'
              ? {
                  condition:
                    'Requires an end-frame-capable model and API mode.',
                }
              : mode == null
                ? 'unknown'
                : false,
          referenceImage: mode == null ? 'unknown' : mode === 'i2v',
          referenceVideo: false,
        },
        generateAudio:
          mode === 'motion-control'
            ? false
            : { condition: 'Requires a sound-capable model and API mode.' },
        aspectRatio:
          mode === 't2v'
            ? true
            : mode === 'i2v'
              ? { condition: 'Supported for multi-image-to-video requests.' }
              : false,
        resolution: false,
        duration: mode == null ? 'unknown' : mode !== 'motion-control',
        fps: false,
        seed: false,
        maxVideosPerCall: 1,
        ...videoDescriptions[modelId],
      },
    },
    providerOptions: {
      video: Object.fromEntries(
        Object.keys(klingAIProviderOptions.video).map(key => [
          key,
          'unknown' as const,
        ]),
      ),
    },
    requestConfig: { video: { mode } },
  } as const;
  return entry satisfies ModelEntry<{
    video: { mode: Exclude<KlingAIVideoMode, 'mi2v'> | undefined };
  }>;
}
export const klingAIModelCatalog = Object.fromEntries(
  videoModelIds.map(id => [id, getKlingAIVideoModelEntry(id)]),
);
