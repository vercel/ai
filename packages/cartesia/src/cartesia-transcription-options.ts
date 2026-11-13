import type { CartesiaModelIds } from './cartesia-model-catalog';
export type CartesiaTranscriptionModelId =
  | CartesiaModelIds['transcription']
  | (string & {});
