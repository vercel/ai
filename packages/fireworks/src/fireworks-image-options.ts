import type { FireworksModelIds } from './fireworks-model-catalog';

// https://fireworks.ai/models?type=image
export type FireworksImageModelId = FireworksModelIds['image'] | (string & {});
