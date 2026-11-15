import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { FishAudioSpeechModelOptions } from './fish-audio-speech-model-options';
import type { FishAudioTranscriptionModelOptions } from './fish-audio-transcription-model-options';

export const fishAudioProviderOptions = {
  speech: {
    referenceId: {
      description:
        'Voice model ID(s). A single ID selects one speaker; an array enables multi-speaker dialogue (S2-Pro models), in which case the text must mark turns with speaker tokens such as `<|speaker:0|>`. The speaker index maps to the position in this array. Takes precedence over the top-level `voice` option.',
    },
    sampleRate: {
      description:
        'Output sample rate in Hz. Falls back to the format default when unset (44100 Hz for wav/pcm/mp3, 48000 Hz for opus).',
    },
    mp3Bitrate: {
      description: 'Bitrate in kbps for mp3 output. Ignored for other formats.',
    },
    opusBitrate: {
      description:
        'Bitrate in bps for opus output, where `-1000` selects automatic. Ignored for other formats.',
    },
    latency: {
      description:
        'Latency/quality tradeoff. `normal` gives the best quality, `balanced` reduces latency, and `low` is the fastest.',
    },
    volume: {
      description: 'Volume offset in dB. Negative values are quieter.',
    },
    normalizeLoudness: {
      description:
        'Loudness normalization. Supported by the S2 family (`s2-pro` and `s2.1-pro`). Fish Audio accepts it on `s1` but ignores it, so the provider emits a warning in that case.',
    },
    temperature: {
      description:
        'Governs expressiveness. Higher values are more varied, lower values more consistent.',
    },
    topP: { description: 'Controls diversity via nucleus sampling.' },
    chunkLength: { description: 'Text segment size for processing.' },
    minChunkLength: {
      description: 'Minimum characters before splitting into a new chunk.',
    },
    normalize: {
      description:
        'Text normalization for English and Chinese. Helps stability with numbers.',
    },
    maxNewTokens: {
      description: 'Maximum audio tokens to generate per text chunk.',
    },
    repetitionPenalty: {
      description: 'Values above 1.0 discourage repeated audio patterns.',
    },
    conditionOnPreviousChunks: {
      description:
        'Reuse prior audio as context for voice consistency across chunks.',
    },
    earlyStopThreshold: {
      description: 'Early-stop threshold used in batch processing.',
    },
    features: {
      description:
        "Request-scoped flags passed through to the inference backend, e.g. `['quality-guard']`.",
    },
  } satisfies Record<
    keyof FishAudioSpeechModelOptions,
    ProviderOptionDefinition
  >,
  transcription: {
    language: {
      description:
        'Language of the audio. A hint only. Fish Audio passes it to the model, but auto-detection is authoritative and overrides it, so this changes neither the transcript nor the reported language. The detected language is reported as `result.language`.',
    },
    ignoreTimestamps: {
      description:
        'Whether to skip precise timestamps. Mirrors the Fish Audio `ignore_timestamps` parameter, whose API default is `true`. This provider defaults it to `false` so that `result.segments` is populated. Fish Audio documents an added latency cost for audio shorter than 30 seconds; set this to `true` to trade segments for that latency.',
    },
  } satisfies Record<
    keyof FishAudioTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const fishAudioSpeechModelIds = [
  's1',
  's2-pro',
  's2.1-pro',
  's2.1-pro-free',
] as const;
export const fishAudioTranscriptionModelIds = ['transcribe-1'] as const;

const speechDefinitions = {
  s1: { normalizeLoudness: false, multiSpeaker: false },
  's2-pro': { normalizeLoudness: true, multiSpeaker: true },
  's2.1-pro': { normalizeLoudness: true, multiSpeaker: true },
  's2.1-pro-free': { normalizeLoudness: 'unknown', multiSpeaker: 'unknown' },
} as const;
export function getFishAudioSpeechModelEntry(modelId: string) {
  const definition =
    speechDefinitions[modelId as keyof typeof speechDefinitions];
  const speech = {
    instructions: false,
    multiSpeaker: definition?.multiSpeaker ?? 'unknown',
    normalizeLoudness: definition?.normalizeLoudness ?? 'unknown',
  } as const;
  return {
    capabilities: { speech },
    providerOptions: {
      speech: {
        ...Object.fromEntries(
          Object.keys(fishAudioProviderOptions.speech).map(
            key => [key, definition != null ? true : 'unknown'] as const,
          ),
        ),
        referenceId: {
          condition:
            'A string selects one voice; arrays require a multi-speaker S2 Pro model and speaker tokens in the prompt.',
        },
        normalizeLoudness: speech.normalizeLoudness,
        mp3Bitrate: { condition: 'MP3 output only.' },
        opusBitrate: { condition: 'Opus output only.' },
      },
    },
  } as const satisfies ModelEntry;
}
export function getFishAudioTranscriptionModelEntry(modelId: string) {
  const known = fishAudioTranscriptionModelIds.some(id => id === modelId);
  return {
    capabilities: {
      transcription: {
        transcription: true,
        streaming: false,
        duration: true,
        segments: { condition: 'Returned unless ignoreTimestamps is true.' },
        language: true,
      },
    },
    providerOptions: {
      transcription: {
        language: {
          condition: 'A hint only; automatic detection remains authoritative.',
        },
        ignoreTimestamps: known ? true : 'unknown',
      },
    },
    requestConfig: { transcription: { ignoreTimestamps: false } },
  } as const satisfies ModelEntry<{
    transcription: { ignoreTimestamps: boolean };
  }>;
}

export const fishAudioModelCatalog: Record<
  string,
  ModelEntry<Record<string, unknown>>
> = {};
for (const id of fishAudioSpeechModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getFishAudioSpeechModelEntry(id);
  const previous = fishAudioModelCatalog[id];
  fishAudioModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}
for (const id of fishAudioTranscriptionModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getFishAudioTranscriptionModelEntry(id);
  const previous = fishAudioModelCatalog[id];
  fishAudioModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}

/** Known model IDs, derived from the declarations used to build the catalog. */
export type FishAudioModelIds = {
  speech: (typeof fishAudioSpeechModelIds)[number];
  transcription: (typeof fishAudioTranscriptionModelIds)[number];
};
