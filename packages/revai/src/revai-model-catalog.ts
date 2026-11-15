import type {
  ModelEntry,
  ProviderOptionDefinition,
  ProviderOptionDefinitions,
} from '@ai-sdk/provider';
import type { RevaiTranscriptionModelOptions } from './revai-transcription-model-options';

export const revaiProviderOptions = {
  transcription: {
    metadata: {
      description:
        'Optional metadata string to associate with the transcription job.',
    },
    notification_config: {
      description:
        'Configuration for webhook notifications when job is complete.',
    },
    delete_after_seconds: {
      description:
        'Number of seconds after which the job will be automatically deleted.',
    },
    verbatim: {
      description:
        'Whether to include filler words and false starts in the transcription.',
    },
    rush: {
      description: 'Whether to prioritize the job for faster processing.',
    },
    test_mode: { description: 'Whether to run the job in test mode.' },
    segments_to_transcribe: {
      description: 'Specific segments of the audio to transcribe.',
    },
    speaker_names: {
      description: 'Names to assign to speakers in the transcription.',
    },
    skip_diarization: { description: 'Whether to skip speaker diarization.' },
    skip_postprocessing: {
      description: 'Whether to skip post-processing steps.',
    },
    skip_punctuation: {
      description: 'Whether to skip adding punctuation to the transcription.',
    },
    remove_disfluencies: {
      description:
        'Whether to remove disfluencies (um, uh, etc.) from the transcription.',
    },
    remove_atmospherics: {
      description:
        'Whether to remove atmospheric sounds from the transcription.',
    },
    filter_profanity: {
      description: 'Whether to filter profanity from the transcription.',
    },
    speaker_channels_count: {
      description: 'Number of speaker channels in the audio.',
    },
    speakers_count: {
      description: 'Expected number of speakers in the audio.',
    },
    diarization_type: { description: 'Type of diarization to use.' },
    custom_vocabulary_id: {
      description: 'ID of a custom vocabulary to use for the transcription.',
    },
    custom_vocabularies: {
      description: 'Custom vocabularies to use for the transcription.',
    },
    strict_custom_vocabulary: {
      description: 'Whether to strictly enforce custom vocabulary.',
    },
    summarization_config: {
      description:
        'Configuration for generating a summary of the transcription.',
    },
    translation_config: {
      description: 'Configuration for translating the transcription.',
    },
    language: { description: 'Language of the audio content.' },
    forced_alignment: { description: 'Whether to perform forced alignment.' },
  } satisfies Record<
    keyof RevaiTranscriptionModelOptions,
    ProviderOptionDefinition
  >,
} as const satisfies ProviderOptionDefinitions;

export const revaiTranscriptionModelIds = [
  'machine',
  'low_cost',
  'fusion',
] as const;

export function getRevaiTranscriptionModelEntry(modelId: string) {
  const known = revaiTranscriptionModelIds.some(id => id === modelId);
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
          Object.keys(revaiProviderOptions.transcription).map(
            key => [key, known ? true : 'unknown'] as const,
          ),
        ),
        rush: {
          condition:
            'Only available for the human transcriber option; unavailable for HIPAA accounts.',
        },
        skip_postprocessing: { condition: 'English and Spanish only.' },
        speaker_channels_count: {
          condition: 'English, Spanish, and French only.',
        },
        speakers_count: { condition: 'English, Spanish, and French only.' },
      },
    },
    requestConfig: {
      transcription: { pollingInterval: 1000, timeoutMs: 60000 },
    },
  } as const satisfies ModelEntry<{
    transcription: { pollingInterval: number; timeoutMs: number };
  }>;
}

export const revaiModelCatalog = Object.fromEntries(
  revaiTranscriptionModelIds.map(id => [
    id,
    getRevaiTranscriptionModelEntry(id),
  ]),
);

/** Known model IDs, derived from the declarations used to build the catalog. */
export type RevaiModelIds = {
  transcription: (typeof revaiTranscriptionModelIds)[number];
};
