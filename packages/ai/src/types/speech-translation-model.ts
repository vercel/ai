import type { Experimental_SpeechTranslationModelV4 } from '@ai-sdk/provider';

/**
 * Speech translation model that is used by the AI SDK.
 *
 * Experimental: part of the experimental speech translation modality and may
 * change in patch releases.
 */
export type SpeechTranslationModel =
  | string
  | Experimental_SpeechTranslationModelV4;
