import type { ElevenLabsModelIds } from './elevenlabs-model-catalog';
export type ElevenLabsSpeechModelId =
  | ElevenLabsModelIds['speech']
  | (string & {});

export type ElevenLabsSpeechVoiceId = string;
