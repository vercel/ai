export { createGradium, gradium } from './gradium-provider';
export type {
  GradiumProvider,
  GradiumProviderSettings,
} from './gradium-provider';

// Speech (TTS)
export type { GradiumSpeechModelId } from './gradium-speech-options';
export {
  gradiumSpeechModelOptionsSchema,
  gradiumSpeechProviderOptionsSchema,
  gradiumProviderOptionsSchema,
} from './gradium-speech-model-options';
export type {
  GradiumSpeechModelOptions,
  GradiumSpeechProviderOptions,
  GradiumProviderOptions,
} from './gradium-speech-model-options';

// Transcription (STT)
export type { GradiumTranscriptionModelId } from './gradium-transcription-options';
export {
  gradiumTranscriptionModelOptionsSchema,
  gradiumTranscriptionProviderOptionsSchema,
} from './gradium-transcription-model-options';
export type {
  GradiumTranscriptionModelOptions,
  GradiumTranscriptionProviderOptions,
} from './gradium-transcription-model-options';

// Wire types — useful for typing extension code.
export type {
  GradiumTTSOutputFormat,
  GradiumSTTInputFormat,
  GradiumTTSJsonConfig,
  GradiumTTSMessage,
  GradiumTTSRequestBody,
  GradiumSTTMessage,
} from './gradium-api-types';
export {
  GRADIUM_TTS_OUTPUT_FORMATS,
  GRADIUM_STT_INPUT_FORMATS,
} from './gradium-api-types';

// Helper APIs (voices, pronunciations, credits).
export type {
  GradiumVoicesAPI,
  GradiumVoice,
  GradiumVoiceTag,
  GradiumVoiceListOptions,
  GradiumVoiceCreateOptions,
  GradiumVoiceUpdateOptions,
} from './gradium-voices';
export type {
  GradiumPronunciationsAPI,
  GradiumPronunciationDictionary,
  GradiumPronunciationRule,
  GradiumPronunciationListOptions,
  GradiumPronunciationListResponse,
  GradiumPronunciationCreateOptions,
  GradiumPronunciationUpdateOptions,
  GradiumCreditsAPI,
  GradiumCreditsSummary,
} from './gradium-pronunciations';
