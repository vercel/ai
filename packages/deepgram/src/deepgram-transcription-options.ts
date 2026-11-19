import type { DeepgramModelIds } from './deepgram-model-catalog';
export type DeepgramTranscriptionModelId =
  | DeepgramModelIds['transcription']
  | (string & {});
