import type { QuiverAIModelIds } from './quiverai-model-catalog';
export type QuiverAILanguageModelId =
  | QuiverAIModelIds['language']
  | (string & {});
