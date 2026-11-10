import type { ProdiaModelIds } from './prodia-model-catalog';

/**
 * Prodia job types for image generation.
 */
export type ProdiaImageModelId = ProdiaModelIds['image'] | (string & {});
