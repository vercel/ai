import type { DeepInfraModelIds } from './deepinfra-model-catalog';

// https://deepinfra.com/models/text-to-image
export type DeepInfraImageModelId = DeepInfraModelIds['image'] | (string & {});
