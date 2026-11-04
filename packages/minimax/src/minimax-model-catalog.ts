import type {
  ModelCapabilities,
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type {
  MiniMaxLanguageModelChatOptions,
  MiniMaxLanguageModelOptions,
} from './minimax-chat-language-model-options';
import {
  minimaxVideoResolutions,
  type MiniMaxVideoModelOptions,
} from './minimax-video-model-options';

/** Known options accepted under providerOptions; open-ended extension keys remain undeclared. */
export const miniMaxProviderOptions = {
  language: {
    effort: {
      description:
        "Reasoning effort for MiniMax M3.1 and later models. Higher levels can use more reasoning tokens and increase latency. Defaults to the server's setting.",
    },
    thinking: { description: 'thinking' },
  } satisfies Record<
    keyof MiniMaxLanguageModelChatOptions | keyof MiniMaxLanguageModelOptions,
    ProviderOptionDefinition
  >,
  video: {
    resolution: { description: 'Output resolution.' },
    ratio: {
      description:
        'Aspect ratio of the generated video. Overrides the top-level `aspectRatio`.',
    },
    referenceAudioUrls: {
      description: 'Reference audio URLs for reference-to-video generation.',
    },
    aigcWatermark: {
      description:
        'Whether to embed an AIGC watermark in the output. Defaults to `false`.',
    },
    pollIntervalMs: {
      description:
        'Interval in milliseconds between task status polls. Default: 10000.',
    },
    pollTimeoutMs: {
      description:
        'Maximum time in milliseconds to poll before timing out. Default: 600000.',
    },
  } satisfies Record<keyof MiniMaxVideoModelOptions, ProviderOptionDefinition>,
} as const satisfies ProviderOptionDefinitions;

const languageModelIds = [
  'minimax-m3.1-flash',
  'minimax-m3',
  'minimax-m2.7',
  'minimax-m2.7-highspeed',
  'minimax-m2.5',
  'minimax-m2.5-highspeed',
  'minimax-m2.1',
  'minimax-m2.1-highspeed',
  'minimax-m2',
] as const;
const videoModelIds = ['MiniMax-H3', 'MiniMax-H3-Max'] as const;
const documentedLanguageCapabilities: Record<
  string,
  NonNullable<ModelCapabilities['language']>
> = {
  'MiniMax-M3.1-Flash': {
    inputs: { image: true, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'minimax-m3': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'minimax-m2.7': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'minimax-m2.7-highspeed': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'minimax-m2.5': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'minimax-m2.5-highspeed': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'minimax-m2.1': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'minimax-m2.1-highspeed': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
  'minimax-m2': {
    inputs: { image: false, audio: 'unknown' },
    objectGeneration: true,
    tools: { usage: true, streaming: true },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  },
};
const unknownLanguageCapabilities: NonNullable<ModelCapabilities['language']> =
  {
    inputs: { image: 'unknown', audio: 'unknown' },
    objectGeneration: 'unknown',
    tools: { usage: 'unknown', streaming: 'unknown' },
    reasoning: { support: 'unknown' },
    sampling: { temperature: 'unknown', topP: 'unknown', logprobs: 'unknown' },
  };
export function getMiniMaxLanguageModelEntry(modelId: string) {
  // Compare version components as integers: M3.123 is newer than M3.1.
  // Assume later M-series models retain the M3.1 capabilities.
  const version = /^minimax-m(\d+)(?:\.(\d+))?(?:\.\d+)*(?:-|$)/i.exec(modelId);
  const supportsM31Features =
    version != null &&
    (Number(version[1]) > 3 ||
      (Number(version[1]) === 3 && Number(version[2] ?? 0) >= 1));

  const entry = {
    capabilities: {
      language: {
        ...(documentedLanguageCapabilities[modelId] ??
          unknownLanguageCapabilities),
        m31Features: supportsM31Features,
        inputs: { image: supportsM31Features, audio: false },
        reasoning: { support: true },
        sampling: { temperature: true, topP: true, logprobs: false },
      },
    },
    providerOptions: {
      language: Object.fromEntries(
        Object.keys(miniMaxProviderOptions.language).map(key => [key, true]),
      ),
    },
  } as const;
  return entry satisfies ModelEntry;
}
const modelResolutionSettings: Record<
  string,
  { supported: readonly string[]; default: string }
> = {
  'MiniMax-H3': { supported: ['768P', '2K'], default: '2K' },
  'MiniMax-H3-Max': { supported: ['480P', '768P'], default: '768P' },
};

export function getMiniMaxVideoModelEntry(modelId: string) {
  const resolutionSettings = modelResolutionSettings[modelId];
  const references = modelId !== 'MiniMax-H3-Max';
  const entry = {
    capabilities: {
      video: {
        inputs: {
          text: true,
          image: true,
          firstFrame: true,
          lastFrame: { condition: 'A first frame is also supplied.' },
          referenceImage: references,
          referenceVideo: references,
        },
        generateAudio: false,
        aspectRatio: { condition: 'No frame images are supplied.' },
        resolution: true,
        duration: true,
        fps: false,
        seed: false,
        maxVideosPerCall: 1,
      },
    },
    providerOptions: {
      video: {
        ...Object.fromEntries(
          Object.keys(miniMaxProviderOptions.video).map(key => [key, true]),
        ),
        referenceAudioUrls: references,
      },
    },
    requestConfig: {
      video: {
        supportedResolutions:
          resolutionSettings?.supported ?? minimaxVideoResolutions,
        defaultResolution: resolutionSettings?.default ?? '2K',
        minDurationSeconds: modelId === 'MiniMax-H3' ? 4 : 5,
      },
    },
  } as const;
  return entry satisfies ModelEntry<{
    video: {
      supportedResolutions: readonly string[];
      defaultResolution: string;
      minDurationSeconds: number;
    };
  }>;
}
export const minimaxModelCatalog = Object.fromEntries([
  ...languageModelIds.map(
    id => [id, getMiniMaxLanguageModelEntry(id)] as const,
  ),
  ...videoModelIds.map(id => [id, getMiniMaxVideoModelEntry(id)] as const),
]);
