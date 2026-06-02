import type { GoogleSpeechModelOptions } from '@ai-sdk/google';

// Gemini text-to-speech models available on Vertex AI. Note the IDs differ from
// the Gemini Developer API (e.g. `gemini-2.5-flash-tts` here vs
// `gemini-2.5-flash-preview-tts` on the Generative Language API).
// https://docs.cloud.google.com/text-to-speech/docs/gemini-tts
export type GoogleVertexSpeechModelId =
  | 'gemini-2.5-flash-tts'
  | 'gemini-2.5-pro-tts'
  | 'gemini-2.5-flash-lite-preview-tts'
  | 'gemini-3.1-flash-tts-preview'
  | (string & {});

/**
 * Provider options for Google Vertex speech models. Vertex reuses the Gemini
 * speech model from `@ai-sdk/google`, so the provider options are identical
 * (e.g. `multiSpeakerVoiceConfig`).
 */
export type GoogleVertexSpeechModelOptions = GoogleSpeechModelOptions;
