import { z } from 'zod/v4';

/**
 * Nebul embedding model ids from the Nebul Model Catalog,
 * https://docs.nebul.io/docs/inference-api/models/model-catalog
 * retrieved on 2026-09-08.
 */
export type NebulEmbeddingModelId =
  | 'sentence-transformers/all-MiniLM-L6-v2'
  | 'Qwen/Qwen3-Embedding-8B'
  | 'BAAI/bge-m3'
  | 'intfloat/multilingual-e5-large-instruct'
  | (string & {});

export const nebulEmbeddingModelOptions = z.object({});

export type NebulEmbeddingModelOptions = z.infer<
  typeof nebulEmbeddingModelOptions
>;
