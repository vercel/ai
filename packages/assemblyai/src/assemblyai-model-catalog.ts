import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { AssemblyAISpeechModelOptions } from './assemblyai-speech-model-options';
import type { AssemblyAITranscriptionModelOptions } from './assemblyai-transcription-model-options';

export const assemblyaiProviderOptions = {
  speech: {
    bitRate: {
      description: 'MP3 bit rate in bits per second. MP3 output only.',
    },
    container: {
      description:
        "Output container: `'raw'` for the encoded samples alone or `'wav'` for a WAV file. Requires a `pcm_*` encoding.",
    },
    encoding: {
      description:
        "Audio encoding of the output (`'pcm_s16le'`, `'pcm_mulaw'`, `'pcm_alaw'`, or `'mp3'`). Overrides the encoding derived from `outputFormat`.",
    },
    sampleRate: {
      description:
        'Sample rate of the output audio in Hz (8000, 16000, 22050, 24000, 44100, 48000).',
    },
  } satisfies Record<
    keyof AssemblyAISpeechModelOptions,
    ProviderOptionDefinition
  >,
  transcription: {
    audioEndAt: { description: 'End time of the audio in milliseconds.' },
    audioStartFrom: { description: 'Start time of the audio in milliseconds.' },
    autoChapters: {
      description:
        'Whether to automatically generate chapters for the transcription.',
    },
    autoHighlights: {
      description:
        'Whether to automatically generate highlights for the transcription.',
    },
    boostParam: {
      description:
        "Boost parameter for word boost (used with `wordBoost`). Allowed values: 'low', 'default', 'high'.",
    },
    contentSafety: {
      description: 'Whether to enable content safety filtering.',
    },
    contentSafetyConfidence: {
      description:
        'Confidence threshold for content safety filtering (25-100).',
    },
    customSpelling: {
      description: 'Custom spelling rules for the transcription.',
    },
    disfluencies: {
      description:
        'Whether to include filler words (um, uh, etc.) in the transcription.',
    },
    domain: {
      description:
        "Enable a domain-specific model to improve accuracy for specialized terminology. Currently supports `'medical-v1'` (Medical Mode).",
    },
    entityDetection: { description: 'Whether to enable entity detection.' },
    filterProfanity: {
      description: 'Whether to filter profanity from the transcription.',
    },
    formatText: {
      description:
        'Whether to format text with punctuation and capitalization.',
    },
    iabCategories: {
      description: 'Whether to enable IAB categories detection.',
    },
    keytermsPrompt: {
      description:
        'Domain-specific keyterms to boost recognition for (max 6 words per phrase). Replaces `wordBoost` for newer models: supported by `assemblyai-stt-3-7` and `universal-3-5-pro` (and `universal-2` when metaphone is enabled for the account).',
    },
    languageCode: { description: 'Language code for the transcription.' },
    languageConfidenceThreshold: {
      description: 'Confidence threshold for language detection.',
    },
    languageDetection: { description: 'Whether to enable language detection.' },
    languageDetectionOptions: {
      description: 'Options for automatic language detection.',
    },
    multichannel: { description: 'Whether to process audio as multichannel.' },
    prompt: {
      description:
        'Provide natural-language context (up to 1,500 words) to steer the model. Only supported by `assemblyai-stt-3-7` and `universal-3-5-pro`.',
    },
    punctuate: {
      description: 'Whether to add punctuation to the transcription.',
    },
    redactPii: {
      description:
        'Whether to redact personally identifiable information (PII).',
    },
    redactPiiAudio: { description: 'Whether to redact PII in the audio file.' },
    redactPiiAudioOptions: {
      description:
        'Options for PII-redacted audio files. Requires `redactPiiAudio`.',
    },
    redactPiiAudioQuality: { description: 'Audio format for PII redaction.' },
    redactPiiPolicies: { description: 'List of PII types to redact.' },
    redactPiiReturnUnredacted: {
      description:
        'Return the original unredacted transcript alongside the redacted one. Requires `redactPii`.',
    },
    redactPiiSub: { description: 'Substitution method for redacted PII.' },
    redactStaticEntities: {
      description:
        "Map of user-defined labels to exact terms to redact, e.g. `{ INTERNAL_TOOL: ['Bearclaw'] }`. Applied on top of standard PII redaction using `redactPiiSub`. Requires `redactPii`.",
    },
    removeAudioTags: {
      description:
        "Remove inline annotations from rich transcripts. `'all'` removes all inline annotations; `'speaker'` removes only speaker cues. AssemblyAI-STT-3.7 and Universal-3 Pro models.",
    },
    sentimentAnalysis: { description: 'Whether to enable sentiment analysis.' },
    speakerLabels: {
      description: 'Whether to identify different speakers in the audio.',
    },
    speakerOptions: {
      description:
        'Options for speaker diarization, e.g. a range of possible speakers.',
    },
    speakersExpected: {
      description: 'Number of speakers expected in the audio.',
    },
    speechThreshold: { description: 'Threshold for speech detection (0-1).' },
    streaming: {
      description:
        'Streaming session settings for realtime models (turn detection, keyterms, languages, diarization, redaction).',
    },
    summarization: {
      description: 'Whether to generate a summary of the transcription.',
    },
    summaryModel: { description: 'Model to use for summarization.' },
    summaryType: { description: 'Type of summary to generate.' },
    temperature: {
      description:
        'Sampling temperature (0-1) controlling randomness. AssemblyAI-STT-3.7 and Universal-3 Pro models.',
    },
    webhookAuthHeaderName: {
      description: 'Name of the authentication header for webhook requests.',
    },
    webhookAuthHeaderValue: {
      description: 'Value of the authentication header for webhook requests.',
    },
    webhookUrl: { description: 'URL to send webhook notifications to.' },
    wordBoost: { description: 'List of words to boost recognition for.' },
  } satisfies Record<
    keyof AssemblyAITranscriptionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const assemblyaiTranscriptionModelIds = [
  'assemblyai-stt-3-7',
  'assemblyai-stt-3-7-realtime',
  'assemblyai-stt-3-7-realtime-agent',
  'universal-2',
  'universal-3-5-pro',
  'universal-3-6-pro',
] as const;

const modelPolicies: Record<
  string,
  {
    deprecated?: boolean;
    replacementWarning?: string;
    prompted?: boolean;
    streaming?: boolean;
  }
> = {
  'assemblyai-stt-3-7': { prompted: true },
  'assemblyai-stt-3-7-realtime': { streaming: true },
  'assemblyai-stt-3-7-realtime-agent': { streaming: true },
  'universal-2': {
    replacementWarning:
      "'assemblyai-stt-3-7' is AssemblyAI's latest flagship model; 'universal-2' remains available for languages it does not support.",
  },
  'universal-3-5-pro': { prompted: true, deprecated: true },
  'universal-3-6-pro': {
    streaming: true,
    replacementWarning:
      "'universal-3-6-pro' is AssemblyAI's previous-generation streaming model; 'assemblyai-stt-3-7-realtime-agent' replaces it.",
  },
};
export function getAssemblyAITranscriptionModelEntry(modelId: string) {
  const policy = modelPolicies[modelId];
  const known = policy != null;
  const prompted = policy?.prompted ?? false;
  const streaming = policy?.streaming ?? false;
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
        ...Object.fromEntries(
          Object.keys(assemblyaiProviderOptions.transcription).map(
            key => [key, known ? !streaming : 'unknown'] as const,
          ),
        ),
        streaming: known ? streaming : 'unknown',
        // Streaming models accept only `streaming`; the pre-recorded options
        // keep their model-specific support below.
        ...(!streaming && {
          prompt: known ? prompted : 'unknown',
          temperature: known ? prompted : 'unknown',
          removeAudioTags: known ? prompted : 'unknown',
          wordBoost: known ? !prompted : 'unknown',
          boostParam: known ? !prompted : 'unknown',
          keytermsPrompt: prompted
            ? true
            : {
                condition:
                  'Supported by Universal-2 when enabled for the account; use AssemblyAI-STT-3.7 otherwise.',
              },
          domain: {
            condition:
              'Requires a model and account with Medical Mode enabled.',
          },
          redactPiiReturnUnredacted: { condition: 'Requires redactPii.' },
          redactStaticEntities: { condition: 'Requires redactPii.' },
          redactPiiAudioOptions: { condition: 'Requires redactPiiAudio.' },
        }),
      },
    },
    requestConfig: {
      transcription: {
        deprecated: policy?.deprecated ?? false,
        replacementWarning: policy?.replacementWarning,
      },
    },
  } as const satisfies ModelEntry<{
    transcription: {
      deprecated: boolean;
      replacementWarning?: string;
    };
  }>;
}

export const assemblyaiSpeechModelIds = ['assemblyai-tts-1'] as const;

export function getAssemblyAISpeechModelEntry(modelId: string) {
  const known = assemblyaiSpeechModelIds.some(id => id === modelId);
  return {
    capabilities: { speech: { instructions: false } },
    providerOptions: {
      speech: {
        ...Object.fromEntries(
          Object.keys(assemblyaiProviderOptions.speech).map(
            key => [key, known ? true : 'unknown'] as const,
          ),
        ),
        bitRate: { condition: 'MP3 output only.' },
        container: { condition: 'Requires a pcm_* encoding.' },
      },
    },
  } as const satisfies ModelEntry;
}

export const assemblyaiModelCatalog: Record<
  string,
  ModelEntry<Record<string, unknown>>
> = Object.fromEntries([
  ...assemblyaiSpeechModelIds.map(id => [
    id,
    getAssemblyAISpeechModelEntry(id),
  ]),
  ...assemblyaiTranscriptionModelIds.map(id => [
    id,
    getAssemblyAITranscriptionModelEntry(id),
  ]),
]);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type AssemblyAIModelIds = {
  speech: (typeof assemblyaiSpeechModelIds)[number];
  transcription: (typeof assemblyaiTranscriptionModelIds)[number];
};
