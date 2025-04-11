export type GladiaTranscriptionInitiateAPITypes = {
  audio_url: string; // URL to a Gladia file or to an external audio or video file
  context_prompt?: string; // [Alpha] Context to feed the transcription model with for possible better accuracy
  custom_vocabulary?: boolean | any[]; // [Beta] Can be either boolean to enable custom_vocabulary or an array with specific vocabulary
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
  }; // [Beta] Custom vocabulary configuration
  detect_language?: boolean; // Detect the language from the given audio
  enable_code_switching?: boolean; // Detect multiple languages in the given audio
  code_switching_config?: {
    languages?: string[]; // Specify the languages you want to use when detecting multiple languages
  };
  language?: string; // The original language in iso639-1 format
  callback?: boolean; // Enable callback for this transcription
  callback_config?: {
    url: string; // The URL to be called with the result of the transcription
    method?: 'POST' | 'PUT'; // The HTTP method to be used
  };
  subtitles?: boolean; // Enable subtitles generation for this transcription
  subtitles_config?: {
    formats?: ('srt' | 'vtt')[]; // Subtitles formats
    minimum_duration?: number; // Minimum duration of a subtitle in seconds
    maximum_duration?: number; // Maximum duration of a subtitle in seconds
    maximum_characters_per_row?: number; // Maximum number of characters per row
    maximum_rows_per_caption?: number; // Maximum number of rows per caption
    style?: 'default' | 'compliance'; // Style of the subtitles
  };
  diarization?: boolean; // Enable speaker recognition (diarization) for this audio
  diarization_config?: {
    number_of_speakers?: number; // Exact number of speakers in the audio
    min_speakers?: number; // Minimum number of speakers in the audio
    max_speakers?: number; // Maximum number of speakers in the audio
    enhanced?: boolean; // [Alpha] Use enhanced diarization for this audio
  };
  translation?: boolean; // [Beta] Enable translation for this audio
  translation_config?: {
    target_languages: string[]; // The target language in iso639-1 format
    model?: 'base' | 'enhanced'; // Model for translation
    match_original_utterances?: boolean; // Align translated utterances with the original ones
  };
  summarization?: boolean; // [Beta] Enable summarization for this audio
  summarization_config?: {
    type?: 'general' | 'bullet_points' | 'concise'; // The type of summarization to apply
  };
  moderation?: boolean; // [Alpha] Enable moderation for this audio
  named_entity_recognition?: boolean; // [Alpha] Enable named entity recognition for this audio
  chapterization?: boolean; // [Alpha] Enable chapterization for this audio
  name_consistency?: boolean; // [Alpha] Enable names consistency for this audio
  custom_spelling?: boolean; // [Alpha] Enable custom spelling for this audio
  custom_spelling_config?: {
    spelling_dictionary: Record<string, string[]>; // The list of spelling applied on the audio transcription
  };
  structured_data_extraction?: boolean; // [Alpha] Enable structured data extraction for this audio
  structured_data_extraction_config?: {
    classes: string[]; // The list of classes to extract from the audio transcription
  };
  sentiment_analysis?: boolean; // [Alpha] Enable sentiment analysis for this audio
  audio_to_llm?: boolean; // [Alpha] Enable audio to llm processing for this audio
  audio_to_llm_config?: {
    prompts: string[]; // The list of prompts applied on the audio transcription
  };
  custom_metadata?: Record<string, any>; // Custom metadata you can attach to this transcription
  sentences?: boolean; // Enable sentences for this audio
  display_mode?: boolean; // [Alpha] Allows to change the output display_mode for this audio
  punctuation_enhanced?: boolean; // [Alpha] Use enhanced punctuation for this audio
};
