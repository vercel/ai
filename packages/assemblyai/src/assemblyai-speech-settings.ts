import type { AssemblyAIModelIds } from './assemblyai-model-catalog';

export type AssemblyAISpeechModelId =
  | AssemblyAIModelIds['speech']
  | (string & {});
