import type { DeepInfraModelIds } from './deepinfra-model-catalog';

// https://deepinfra.com/models/text-generation
export type DeepInfraChatModelId =
  | DeepInfraModelIds['language']
  | (string & {});
