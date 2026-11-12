import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { ElevenLabsSpeechModelOptions } from './elevenlabs-speech-model-options';
import type { ElevenLabsTranscriptionModelOptions } from './elevenlabs-transcription-model-options';

export const elevenLabsProviderOptions = {
  speech: {
    withTimestamps: {
      description:
        'Return character alignment for speech or lyric word timestamps for music.',
    },
    languageCode: { description: 'Language code.' },
    voiceSettings: { description: 'Voice settings.' },
    pronunciationDictionaryLocators: {
      description: 'Pronunciation dictionary locators.',
    },
    seed: { description: 'Seed.' },
    previousText: { description: 'Previous text.' },
    nextText: { description: 'Next text.' },
    previousRequestIds: { description: 'Previous request ids.' },
    nextRequestIds: { description: 'Next request ids.' },
    applyTextNormalization: { description: 'Apply text normalization.' },
    applyLanguageTextNormalization: {
      description: 'Apply language text normalization.',
    },
    enableLogging: { description: 'Enable logging.' },
    streaming: {
      description:
        'WebSocket speech settings; not used by non-streaming generation.',
    },
    dialogue: { description: 'Voice settings for streaming text-to-dialogue.' },
    inputs: {
      description: 'Text and voice pairs for non-streaming text-to-dialogue.',
    },
    musicLengthMs: { description: 'Music length ms.' },
    forceInstrumental: { description: 'Force instrumental.' },
    compositionPlan: {
      description: 'Native music composition plan; replaces the text prompt.',
    },
    durationSeconds: { description: 'Duration seconds.' },
    promptInfluence: { description: 'Prompt influence.' },
    loop: { description: 'Loop.' },
  } satisfies Record<
    keyof ElevenLabsSpeechModelOptions,
    ProviderOptionDefinition
  >,
  transcription: {
    languageCode: { description: 'Language hint for transcription.' },
    tagAudioEvents: {
      description: 'Include audio event tags in batch transcripts.',
    },
    numSpeakers: {
      description: 'Expected speaker count for batch transcription.',
    },
    timestampsGranularity: {
      description: 'Timestamp precision for batch transcription.',
    },
    diarize: { description: 'Identify speakers in batch transcripts.' },
    fileFormat: { description: 'Input audio format for batch transcription.' },
    sourceUrl: {
      description: 'Transcribe a remote audio source in batch mode.',
    },
    streaming: { description: 'Scribe realtime transcription settings.' },
  } satisfies Record<
    keyof ElevenLabsTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const elevenLabsSpeechModelIds = [
  'eleven_v4',
  'eleven_v4_turbo',
  'eleven_v3',
  'eleven_v3_conversational',
  'eleven_multilingual_v2',
  'eleven_flash_v2_5',
  'eleven_flash_v2',
  'eleven_turbo_v2_5',
  'eleven_turbo_v2',
  'eleven_monolingual_v1',
  'eleven_multilingual_v1',
  'music_v2_5',
  'music_v2',
  'music_v1',
  'eleven_text_to_sound_v2',
  'eleven_text_to_sound_v3',
] as const;
export const elevenLabsTranscriptionModelIds = [
  'scribe_v1',
  'scribe_v1_experimental',
  'scribe_v2',
  'scribe_v2_realtime',
] as const;

export const elevenLabsTextToSpeechOnlyOptions = [
  'applyLanguageTextNormalization',
  'applyTextNormalization',
  'dialogue',
  'inputs',
  'languageCode',
  'nextRequestIds',
  'nextText',
  'previousRequestIds',
  'previousText',
  'pronunciationDictionaryLocators',
  'streaming',
  'voiceSettings',
] as const satisfies ReadonlyArray<keyof ElevenLabsSpeechModelOptions>;
export const elevenLabsMusicOnlyOptions = [
  'compositionPlan',
  'forceInstrumental',
  'musicLengthMs',
] as const satisfies ReadonlyArray<keyof ElevenLabsSpeechModelOptions>;
export const elevenLabsSoundEffectsOnlyOptions = [
  'durationSeconds',
  'loop',
  'promptInfluence',
] as const satisfies ReadonlyArray<keyof ElevenLabsSpeechModelOptions>;
const speechPolicies: Record<
  string,
  {
    defaultDialogue?: boolean;
    singleVoiceDialogue?: boolean;
    streaming?: boolean;
  }
> = {
  eleven_v4: { defaultDialogue: true },
  eleven_v3_conversational: { singleVoiceDialogue: true },
  eleven_monolingual_v1: { streaming: false },
  eleven_multilingual_v1: { streaming: false },
};
export function getElevenLabsSpeechModelEntry(modelId: string) {
  const music = modelId.startsWith('music_');
  const soundEffects = modelId.startsWith('eleven_text_to_sound');
  const dialogue =
    modelId.startsWith('eleven_v3') || modelId.startsWith('eleven_v4');
  const tts = !music && !soundEffects;
  const known = elevenLabsSpeechModelIds.some(id => id === modelId);
  const policy = speechPolicies[modelId];
  const speech = {
    instructions: false,
    speech: true,
    streaming:
      music || soundEffects
        ? false
        : policy?.streaming === false
          ? false
          : dialogue
            ? { condition: 'Requires providerOptions.elevenlabs.dialogue.' }
            : true,
  } as const;
  return {
    capabilities: { speech },
    providerOptions: {
      speech: {
        ...Object.fromEntries(
          Object.keys(elevenLabsProviderOptions.speech).map(
            key => [key, known ? true : 'unknown'] as const,
          ),
        ),
        ...Object.fromEntries(
          elevenLabsTextToSpeechOnlyOptions.map(
            key => [key, tts ? (known ? true : 'unknown') : false] as const,
          ),
        ),
        ...Object.fromEntries(
          elevenLabsMusicOnlyOptions.map(key => [key, music] as const),
        ),
        ...Object.fromEntries(
          elevenLabsSoundEffectsOnlyOptions.map(
            key => [key, soundEffects] as const,
          ),
        ),
        seed: !soundEffects,
        withTimestamps: !soundEffects,
        dialogue: dialogue
          ? {
              condition:
                'Streaming dialogue only; eleven_v3_conversational accepts one voice.',
            }
          : false,
        streaming: tts ? { condition: 'Streaming speech only.' } : false,
        inputs: tts
          ? { condition: 'Non-streaming text-to-dialogue only.' }
          : false,
        compositionPlan: music
          ? {
              condition:
                'Music only; cannot be combined with musicLengthMs or forceInstrumental.',
            }
          : false,
      },
    },
    requestConfig: {
      speech: {
        music,
        soundEffects,
        dialogue,
        defaultDialogue: policy?.defaultDialogue ?? false,
        singleVoiceDialogue: policy?.singleVoiceDialogue ?? false,
        incrementalDialogue: modelId.startsWith('eleven_v4'),
      },
    },
  } as const satisfies ModelEntry<{
    speech: {
      music: boolean;
      soundEffects: boolean;
      dialogue: boolean;
      defaultDialogue: boolean;
      singleVoiceDialogue: boolean;
      incrementalDialogue: boolean;
    };
  }>;
}
export function getElevenLabsTranscriptionModelEntry(modelId: string) {
  const streaming = modelId === 'scribe_v2_realtime';
  const known = elevenLabsTranscriptionModelIds.some(id => id === modelId);
  const transcription = {
    transcription: !streaming,
    streaming,
    duration: true,
    segments: true,
    language: true,
    timestamps: streaming,
    languageDetection: streaming,
  } as const;
  return {
    capabilities: { transcription },
    providerOptions: {
      transcription: {
        ...Object.fromEntries(
          Object.keys(elevenLabsProviderOptions.transcription).map(
            key => [key, known ? !streaming : 'unknown'] as const,
          ),
        ),
        languageCode: known ? true : 'unknown',
        streaming,
      },
    },
  } as const satisfies ModelEntry;
}

export const elevenLabsModelCatalog: Record<
  string,
  ModelEntry<Record<string, unknown>>
> = {};
for (const id of elevenLabsSpeechModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getElevenLabsSpeechModelEntry(id);
  const previous = elevenLabsModelCatalog[id];
  elevenLabsModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}
for (const id of elevenLabsTranscriptionModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getElevenLabsTranscriptionModelEntry(id);
  const previous = elevenLabsModelCatalog[id];
  elevenLabsModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}

/** Known model IDs, derived from the declarations used to build the catalog. */
export type ElevenLabsModelIds = {
  speech: (typeof elevenLabsSpeechModelIds)[number];
  transcription: (typeof elevenLabsTranscriptionModelIds)[number];
};
