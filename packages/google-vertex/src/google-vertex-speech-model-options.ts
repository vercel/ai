import type { GoogleSpeechModelOptions } from '@ai-sdk/google';
import type { GoogleVertexModelIds } from './google-vertex-model-catalog';

// Gemini TTS models (Vertex `generateContent` endpoint):
// https://docs.cloud.google.com/text-to-speech/docs/gemini-tts
// Chirp 3: HD voices (Cloud Text-to-Speech `text:synthesize` endpoint):
// https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
export type GoogleVertexSpeechModelId =
  | GoogleVertexModelIds['speech']
  | (string & {});

export type GoogleVertexSpeechModelOptions = GoogleSpeechModelOptions;
