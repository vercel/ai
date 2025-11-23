// Below is just a subset of the available models.
export type AI302EmbeddingModelId =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002'
  | 'jina-clip-v1'
  | 'jina-clip-v2'
  | 'jina-embeddings-v2-base-en'
  | 'jina-embeddings-v2-base-es'
  | 'jina-embeddings-v2-base-de'
  | 'jina-embeddings-v2-base-zh'
  | 'jina-embeddings-v2-base-code'
  | 'jina-embeddings-v3'
  | 'zhipu-embedding-2'
  | 'BAAI/bge-large-en-v1.5'
  | 'BAAI/bge-large-zh-v1.5'
  | 'BAAI/bge-m3'
  | 'Baichuan-Text-Embedding'
  | 'bce-embedding-base_v1'
  | (string & {});

// Settings interface for AI302 embedding models (v2)
export interface AI302EmbeddingSettings {}
