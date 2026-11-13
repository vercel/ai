import type { ElevenLabsModelIds } from './elevenlabs-model-catalog';
export type ElevenLabsTranscriptionModelId =
  | ElevenLabsModelIds['transcription']
  | (string & {});
