import type { ProdiaModelIds } from './prodia-model-catalog';

/**
 * Prodia job types for video generation.
 */
export type ProdiaVideoModelId = ProdiaModelIds['video'] | (string & {});
