import type { ProdiaModelIds } from './prodia-model-catalog';

/**
 * Prodia job types for language model (multimodal img2img).
 */
export type ProdiaLanguageModelId = ProdiaModelIds['language'] | (string & {});
