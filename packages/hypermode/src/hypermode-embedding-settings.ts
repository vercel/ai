import type { OpenAICompatibleEmbeddingSettings } from '@ai-sdk/openai-compatible';

// https://docs.hypermode.com/model-router#embedding
export type HypermodeEmbeddingModelId =
  | 'nomic-ai/nomic-embed-text-v1.5'
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002'
  | (string & {});

export interface HypermodeEmbeddingSettings
  extends OpenAICompatibleEmbeddingSettings {}
