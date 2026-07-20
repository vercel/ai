import type { Experimental_SpeechToSpeechModelV4 } from '@ai-sdk/provider';

/**
 * Speech-to-speech model that is used by the AI SDK.
 *
 * Experimental: part of the experimental speech-to-speech modality and may
 * change in patch releases.
 */
export type SpeechToSpeechModel = string | Experimental_SpeechToSpeechModelV4;
