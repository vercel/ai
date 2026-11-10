import type { FireworksModelIds } from './fireworks-model-catalog';

export type FireworksCompletionModelId =
  | FireworksModelIds['language']
  | (string & {});
