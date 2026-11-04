// Source of truth: https://api.gladia.io/openapi.json → InitTranscriptionRequest

import type { GladiaTranscriptionModelId } from './gladia-transcription-options';

export type GladiaTranscriptionInitiateAPITypes = {
  /** URL to a Gladia file or to an external audio or video file */
  audio_url: string;
  /**
   * Transcription model to use. Defaults to `solaria-1` if omitted.
   */
  model?: GladiaTranscriptionModelId;
  /** [Beta] Enable custom vocabulary for this audio */
  custom_vocabulary?: boolean;
  /** [Beta] Custom vocabulary configuration */
  custom_vocabulary_config?: {
    vocabulary: Array<
      | string
      | {
          value: string;
          intensity?: number;
          pronunciations?: string[];
          language?: string;
        }
    >;
    default_intensity?: number;
  };
  /** Enable callback for this transcription */
  callback?: boolean;
  /** Configuration for callback */
  callback_config?: {
    url: string;
    method?: 'POST' | 'PUT';
  };
  /** Enable subtitles generation for this transcription */
  subtitles?: boolean;
  /** Configuration for subtitles */
  subtitles_config?: {
    formats?: ('srt' | 'vtt')[];
    minimum_duration?: number;
    maximum_duration?: number;
    maximum_characters_per_row?: number;
    maximum_rows_per_caption?: number;
    style?: 'default' | 'compliance';
  };
  /** Enable speaker recognition (diarization) for this audio */
  diarization?: boolean;
  /** Configuration for diarization */
  diarization_config?: {
    number_of_speakers?: number;
    min_speakers?: number;
    max_speakers?: number;
  };
  /** [Beta] Enable translation for this audio */
  translation?: boolean;
  /** Configuration for translation */
  translation_config?: {
    target_languages: string[];
    model?: 'base' | 'enhanced';
    match_original_utterances?: boolean;
    lipsync?: boolean;
    context_adaptation?: boolean;
    context?: string;
    informal?: boolean;
  };
  /** [Beta] Enable summarization for this audio */
  summarization?: boolean;
  /** Configuration for summarization */
  summarization_config?: {
    type?: 'general' | 'bullet_points' | 'concise';
  };
  /** [Alpha] Enable named entity recognition for this audio */
  named_entity_recognition?: boolean;
  /** [Alpha] Enable custom spelling for this audio */
  custom_spelling?: boolean;
  /** Configuration for custom spelling */
  custom_spelling_config?: {
    spelling_dictionary: Record<string, string[]>;
  };
  /** Enable sentiment analysis for this audio */
  sentiment_analysis?: boolean;
  /** [Alpha] Enable audio to llm processing for this audio */
  audio_to_llm?: boolean;
  /** Configuration for audio to llm */
  audio_to_llm_config?: {
    prompts: string[];
    model?: string;
  };
  /** Enable PII redaction for this audio */
  pii_redaction?: boolean;
  /** PII redaction configuration */
  pii_redaction_config?: {
    entity_types?: string[];
    processed_text_type?: 'MARKER' | 'MASK';
  };
  /** Custom metadata you can attach to this transcription */
  custom_metadata?: Record<string, unknown>;
  /** Enable sentences for this audio */
  sentences?: boolean;
  /** [Alpha] Use enhanced punctuation for this audio */
  punctuation_enhanced?: boolean;
  /** Specify the language configuration */
  language_config?: {
    languages?: string[];
    code_switching?: boolean;
  };
};
