import type { DeepInfraModelIds } from './deepinfra-model-catalog';

// https://deepinfra.com/models/embeddings
export type DeepInfraEmbeddingModelId =
  | DeepInfraModelIds['embedding']
  | (string & {});
