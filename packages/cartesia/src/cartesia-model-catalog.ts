import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { CartesiaSpeechModelOptions } from './cartesia-speech-model-options';
import type { CartesiaTranscriptionModelOptions } from './cartesia-transcription-model-options';
import type { CartesiaRealtimeModelOptions } from './cartesia-realtime-model-options';

export const cartesiaProviderOptions = {
  speech: {
    container: {
      description: 'Container format for the output audio (raw, wav, mp3).',
    },
    encoding: {
      description:
        'Encoding type for the audio output (pcm_f32le, pcm_s16le, pcm_mulaw, pcm_alaw).',
    },
    sampleRate: {
      description:
        'Sample rate for the output audio in Hz (e.g. 8000, 16000, 22050, 24000, 44100, 48000).',
    },
    bitRate: {
      description:
        'Bitrate for mp3 output in bits per second (e.g. 32000, 64000, 128000, 192000).',
    },
    speed: { description: 'Controls the speed of the generated speech.' },
    volume: {
      description:
        'Volume of the generated speech, between 0.5 and 2. Sonic 3 and newer.',
    },
    emotion: {
      description:
        'Emotion of the generated speech. Beta, works best with English. Sonic 3 and newer.',
    },
    language: {
      description: 'The language to generate speech in (ISO 639-1 code).',
    },
    locale: {
      description:
        "The regional locale code to generate speech in (e.g. 'en-GB', 'es-MX'). Supported for Sonic 3.6 and later.",
    },
    normalization: {
      description:
        "Controls text normalization ('auto', 'off', or a language or locale code).",
    },
    pronunciationDictionaryId: {
      description:
        'ID of a pronunciation dictionary created with the Cartesia API. Sonic 3 and newer.',
    },
  } satisfies Record<
    keyof CartesiaSpeechModelOptions,
    ProviderOptionDefinition
  >,
  transcription: {
    language: {
      description:
        'The language of the audio (ISO 639-1 code). Defaults to English.',
    },
    timestampGranularities: {
      description:
        'The timestamp granularities to populate. Currently only `word` is supported.',
    },
    streaming: {
      description: 'Options for realtime Ink 2 transcription over WebSocket.',
    },
  } satisfies Record<
    keyof CartesiaTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
  realtime: {} satisfies Record<
    keyof CartesiaRealtimeModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const cartesiaSpeechModelIds = [
  'sonic-3.5',
  'sonic-3',
  'sonic-2',
  'sonic-turbo',
  'sonic-latest',
] as const;
export const cartesiaTranscriptionModelIds = ['ink-whisper', 'ink-2'] as const;
export const cartesiaRealtimeModelIds = ['ink-2'] as const;

export function getCartesiaSpeechModelEntry(modelId: string) {
  const known = cartesiaSpeechModelIds.some(id => id === modelId);
  const sonic3 = modelId === 'sonic-3' || modelId === 'sonic-3.5';
  return {
    capabilities: { speech: { instructions: false } },
    providerOptions: {
      speech: {
        ...Object.fromEntries(
          Object.keys(cartesiaProviderOptions.speech).map(
            key => [key, known ? true : 'unknown'] as const,
          ),
        ),
        volume: known
          ? sonic3
            ? true
            : modelId === 'sonic-latest'
              ? 'unknown'
              : false
          : 'unknown',
        emotion: known
          ? sonic3
            ? true
            : modelId === 'sonic-latest'
              ? 'unknown'
              : false
          : 'unknown',
        pronunciationDictionaryId: known
          ? sonic3
            ? true
            : modelId === 'sonic-latest'
              ? 'unknown'
              : false
          : 'unknown',
        locale: {
          condition:
            'Requires Sonic 3.6 or later; cannot be combined with language.',
        },
      },
    },
  } as const satisfies ModelEntry;
}
export function getCartesiaTranscriptionModelEntry(modelId: string) {
  // Preserve dated Ink Whisper aliases and the streaming fallback for future IDs.
  const streaming =
    modelId !== 'ink-whisper' && !modelId.startsWith('ink-whisper-');
  return {
    capabilities: {
      transcription: {
        transcription: !streaming,
        streaming,
        duration: true,
        segments: true,
        language: true,
      },
    },
    providerOptions: {
      transcription: {
        language: streaming
          ? {
              condition:
                'Streaming transcription currently supports English only.',
            }
          : true,
        timestampGranularities: !streaming,
        streaming,
      },
    },
  } as const satisfies ModelEntry;
}
export function getCartesiaRealtimeModelEntry(_modelId: string) {
  return {
    capabilities: {
      realtime: {
        conversation: 'continuous',
        transports: ['websocket'],
        connections: ['client-secret-websocket'],
        transcription: true,
        turnDetection: true,
        keyterms: true,
      },
    },
    providerOptions: { realtime: {} },
  } as const satisfies ModelEntry & {
    capabilities: {
      realtime: {
        transcription: boolean;
        turnDetection: boolean;
        keyterms: boolean;
      };
    };
  };
}

export const cartesiaModelCatalog: Record<
  string,
  ModelEntry<Record<string, unknown>>
> = {};
for (const id of cartesiaSpeechModelIds) {
  const entry = getCartesiaSpeechModelEntry(id);
  const previous = cartesiaModelCatalog[id];
  cartesiaModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: {
      ...previous?.requestConfig,
    },
  };
}
for (const id of cartesiaTranscriptionModelIds) {
  const entry = getCartesiaTranscriptionModelEntry(id);
  const previous = cartesiaModelCatalog[id];
  cartesiaModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: {
      ...previous?.requestConfig,
    },
  };
}
for (const id of cartesiaRealtimeModelIds) {
  const entry = getCartesiaRealtimeModelEntry(id);
  const previous = cartesiaModelCatalog[id];
  cartesiaModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: {
      ...previous?.requestConfig,
    },
  };
}

/** Known model IDs, derived from the declarations used to build the catalog. */
export type CartesiaModelIds = {
  speech: (typeof cartesiaSpeechModelIds)[number];
  transcription: (typeof cartesiaTranscriptionModelIds)[number];
  realtime: (typeof cartesiaRealtimeModelIds)[number];
};
