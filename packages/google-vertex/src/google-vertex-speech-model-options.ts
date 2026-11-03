import type { GoogleSpeechModelOptions } from '@ai-sdk/google';

// Gemini TTS models (Vertex `generateContent` endpoint):
// https://docs.cloud.google.com/text-to-speech/docs/gemini-tts
// Chirp 3: HD voices (Cloud Text-to-Speech `text:synthesize` endpoint):
// https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
export type GoogleVertexSpeechModelId =
  | 'gemini-2.5-flash-tts'
  | 'gemini-2.5-pro-tts'
  | 'gemini-2.5-flash-lite-preview-tts'
  | 'gemini-3.1-flash-tts-preview'
  | 'chirp-3-hd'
  | (string & {});

export type GoogleVertexSpeechModelOptions = GoogleSpeechModelOptions;
