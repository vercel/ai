import type { FalModelIds } from './fal-model-catalog';

export type FalTranscriptionModelId =
  | FalModelIds['transcription']
  | (string & {});
