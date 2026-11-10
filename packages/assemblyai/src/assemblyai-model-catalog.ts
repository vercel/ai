import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { AssemblyAITranscriptionModelOptions } from './assemblyai-transcription-model-options';

export const assemblyaiProviderOptions = {
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
        'Domain-specific keyterms to boost recognition for (max 6 words per phrase). Replaces `wordBoost` for newer models: supported by `universal-3-pro` / `universal-3-5-pro` and `slam-1` (and `universal-2` when metaphone is enabled for the account).',
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
        'Provide natural-language context (up to 1,500 words) to steer the model. Only supported by `universal-3-pro` / `universal-3-5-pro` and `slam-1`.',
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
        "Remove inline annotations from rich transcripts. `'all'` removes all inline annotations; `'speaker'` removes only speaker cues. Universal-3 Pro models.",
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
    summarization: {
      description: 'Whether to generate a summary of the transcription.',
    },
    summaryModel: { description: 'Model to use for summarization.' },
    summaryType: { description: 'Type of summary to generate.' },
    temperature: {
      description:
        'Sampling temperature (0-1) controlling randomness. Universal-3 Pro models.',
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
  'universal-2',
  'universal-3-pro',
  'universal-3-5-pro',
  'best',
] as const;

const modelPolicies: Record<
  string,
  { legacy?: boolean; replacementWarning?: string; prompted?: boolean }
> = {
  best: { legacy: true },
  'universal-2': {
    replacementWarning:
      "'universal-3-5-pro' is AssemblyAI's latest flagship model.",
  },
  'universal-3-pro': {
    prompted: true,
    replacementWarning:
      "'universal-3-5-pro' is AssemblyAI's latest flagship model and is set to replace 'universal-3-pro'.",
  },
  'universal-3-5-pro': { prompted: true },
  'slam-1': { prompted: true },
};
export function getAssemblyAITranscriptionModelEntry(modelId: string) {
  const policy = modelPolicies[modelId];
  const known = policy != null;
  const prompted = policy?.prompted ?? false;
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
      transcription: {
        ...Object.fromEntries(
          Object.keys(assemblyaiProviderOptions.transcription).map(
            key => [key, known ? true : 'unknown'] as const,
          ),
        ),
        prompt: known ? prompted : 'unknown',
        temperature: known ? prompted : 'unknown',
        removeAudioTags: known ? prompted : 'unknown',
        wordBoost: known ? !prompted : 'unknown',
        boostParam: known ? !prompted : 'unknown',
        keytermsPrompt: prompted
          ? true
          : {
              condition:
                'Supported by Universal-2 when enabled for the account; use a Universal-3 Pro or Slam model otherwise.',
            },
        domain: {
          condition: 'Requires a model and account with Medical Mode enabled.',
        },
        redactPiiReturnUnredacted: { condition: 'Requires redactPii.' },
        redactStaticEntities: { condition: 'Requires redactPii.' },
        redactPiiAudioOptions: { condition: 'Requires redactPiiAudio.' },
      },
    },
    requestConfig: {
      transcription: {
        legacy: policy?.legacy ?? false,
        replacementWarning: policy?.replacementWarning,
      },
    },
  } as const satisfies ModelEntry<{
    transcription: { legacy: boolean; replacementWarning?: string };
  }>;
}

export const assemblyaiModelCatalog = Object.fromEntries(
  assemblyaiTranscriptionModelIds.map(id => [
    id,
    getAssemblyAITranscriptionModelEntry(id),
  ]),
);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type AssemblyAIModelIds = {
  transcription: (typeof assemblyaiTranscriptionModelIds)[number];
};
