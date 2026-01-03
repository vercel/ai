// Re-export types from @vectorstores/core for convenience
export type { VectorStoreIndex } from '@vectorstores/core';
export {
  type VectorstoresToolOptions,
  type VercelEmbeddingOptions,
  vectorstores,
  vercelEmbedding,
} from './vectorstores-adapter';
