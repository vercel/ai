import type { AssemblyAIModelIds } from './assemblyai-model-catalog';

export type AssemblyAITranscriptionModelId =
  | AssemblyAIModelIds['transcription']
  | (string & {});
