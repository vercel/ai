import type { ReplicateModelIds } from './replicate-model-catalog';

export type ReplicateImageModelId = ReplicateModelIds['image'] | (string & {});
