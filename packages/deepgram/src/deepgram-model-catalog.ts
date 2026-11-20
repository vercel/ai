import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { DeepgramSpeechModelOptions } from './deepgram-speech-model-options';
import type { DeepgramTranscriptionModelOptions } from './deepgram-transcription-model-options';

export const deepgramProviderOptions = {
  speech: {
    bitRate: {
      description:
        'Bitrate of the audio in bits per second. Can be a number or predefined enum value.',
    },
    container: {
      description: 'Container format for the output audio (mp3, wav, etc.).',
    },
    encoding: {
      description:
        'Encoding type for the audio output (linear16, mulaw, alaw, etc.).',
    },
    sampleRate: {
      description:
        'Sample rate for the output audio in Hz (8000, 16000, 24000, 44100, 48000).',
    },
    callback: {
      description:
        'URL to which Deepgram would deliver the audio asynchronously. Deepgram answers callback requests with a JSON acknowledgement instead of audio, so `generateSpeech` rejects this option.',
    },
    callbackMethod: {
      description:
        'HTTP method by which the callback request will be made (POST or PUT).',
    },
    mipOptOut: {
      description:
        'Opts out requests from the Deepgram Model Improvement Program.',
    },
    tag: {
      description:
        'Label your requests for the purpose of identification during usage reporting.',
    },
  } satisfies Record<
    keyof DeepgramSpeechModelOptions,
    ProviderOptionDefinition
  >,
  transcription: {
    language: {
      description:
        'Language to use for transcription. If not specified, Deepgram defaults to English. Use `detectLanguage: true` to enable automatic language detection.',
    },
    detectLanguage: {
      description:
        'Whether to enable automatic language detection. When true, Deepgram will detect the language of the audio.',
    },
    smartFormat: {
      description:
        'Whether to use smart formatting, which formats written-out numbers, dates, times, etc.',
    },
    punctuate: { description: 'Whether to add punctuation to the transcript.' },
    paragraphs: {
      description: 'Whether to format the transcript into paragraphs.',
    },
    summarize: {
      description:
        "Whether to generate a summary of the transcript. Use 'v2' for the latest version or false to disable.",
    },
    topics: { description: 'Whether to identify topics in the transcript.' },
    intents: { description: 'Whether to identify intents in the transcript.' },
    sentiment: {
      description: 'Whether to analyze sentiment in the transcript.',
    },
    detectEntities: {
      description:
        'Whether to detect and tag named entities in the transcript.',
    },
    redact: {
      description:
        'Specify terms or patterns to redact from the transcript. Can be a string or array of strings.',
    },
    replace: { description: 'String to replace redacted content with.' },
    search: { description: 'Term or phrase to search for in the transcript.' },
    keyterm: { description: 'Key term to identify in the transcript.' },
    diarize: {
      description: 'Whether to identify different speakers in the audio.',
    },
    utterances: {
      description: 'Whether to segment the transcript into utterances.',
    },
    uttSplit: {
      description:
        'Minimum duration of silence (in seconds) to trigger a new utterance.',
    },
    fillerWords: {
      description:
        'Whether to include filler words (um, uh, etc.) in the transcript.',
    },
    streaming: {
      description:
        'Options for live transcription over the /v1/listen WebSocket.',
    },
  } satisfies Record<
    keyof DeepgramTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const deepgramSpeechModelIds = ['aura', 'aura-2'] as const;
export const deepgramTranscriptionModelIds = [
  'base',
  'base-general',
  'base-meeting',
  'base-phonecall',
  'base-finance',
  'base-conversationalai',
  'base-voicemail',
  'base-video',
  'enhanced',
  'enhanced-general',
  'enhanced-meeting',
  'enhanced-phonecall',
  'enhanced-finance',
  'nova',
  'nova-general',
  'nova-phonecall',
  'nova-medical',
  'nova-2',
  'nova-2-general',
  'nova-2-meeting',
  'nova-2-phonecall',
  'nova-2-finance',
  'nova-2-conversationalai',
  'nova-2-voicemail',
  'nova-2-video',
  'nova-2-medical',
  'nova-2-drivethru',
  'nova-2-automotive',
  'nova-2-atc',
  'nova-3',
  'nova-3-general',
  'nova-3-medical',
] as const;

export function getDeepgramSpeechModelEntry(modelId: string) {
  const voiceFamily = deepgramSpeechModelIds.some(id => id === modelId);
  return {
    capabilities: { speech: { instructions: false } },
    providerOptions: {
      speech: {
        ...Object.fromEntries(
          Object.keys(deepgramProviderOptions.speech).map(
            key => [key, voiceFamily ? true : 'unknown'] as const,
          ),
        ),
        callback: false,
        callbackMethod: false,
      },
    },
    requestConfig: { speech: { voiceFamily } },
  } as const satisfies ModelEntry<{ speech: { voiceFamily: boolean } }>;
}
export function getDeepgramTranscriptionModelEntry(modelId: string) {
  const known = deepgramTranscriptionModelIds.some(id => id === modelId);
  const streaming = !modelId.startsWith('flux');
  return {
    capabilities: {
      transcription: {
        transcription: true,
        streaming,
        duration: true,
        segments: true,
        language: {
          condition:
            'Returned when automatic language detection is enabled and the API supplies detected_language.',
        },
      },
    },
    providerOptions: {
      transcription: {
        ...Object.fromEntries(
          Object.keys(deepgramProviderOptions.transcription).map(
            key => [key, known ? true : 'unknown'] as const,
          ),
        ),
        streaming: streaming
          ? {
              condition:
                'Streaming transcription only; Flux /v2/listen is not supported.',
            }
          : false,
        detectLanguage: { condition: 'Batch transcription only.' },
        paragraphs: { condition: 'Batch transcription only.' },
        summarize: { condition: 'Batch transcription only.' },
        topics: { condition: 'Batch transcription only.' },
        intents: { condition: 'Batch transcription only.' },
        sentiment: { condition: 'Batch transcription only.' },
        detectEntities: { condition: 'Batch transcription only.' },
        utterances: { condition: 'Batch transcription only.' },
        uttSplit: { condition: 'Batch transcription only.' },
      },
    },
  } as const satisfies ModelEntry;
}

export const deepgramModelCatalog: Record<
  string,
  ModelEntry<Record<string, unknown>>
> = {};
for (const id of deepgramSpeechModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getDeepgramSpeechModelEntry(id);
  const previous = deepgramModelCatalog[id];
  deepgramModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}
for (const id of deepgramTranscriptionModelIds) {
  const entry: ModelEntry<Record<string, unknown>> =
    getDeepgramTranscriptionModelEntry(id);
  const previous = deepgramModelCatalog[id];
  deepgramModelCatalog[id] = {
    capabilities: { ...previous?.capabilities, ...entry.capabilities },
    providerOptions: { ...previous?.providerOptions, ...entry.providerOptions },
    requestConfig: { ...previous?.requestConfig, ...entry.requestConfig },
  };
}

/** Known model IDs, derived from the declarations used to build the catalog. */
export type DeepgramModelIds = {
  speech: (typeof deepgramSpeechModelIds)[number];
  transcription: (typeof deepgramTranscriptionModelIds)[number];
};
