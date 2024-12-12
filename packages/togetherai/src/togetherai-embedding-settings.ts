import { OpenAICompatibleEmbeddingSettings } from '@ai-sdk/openai-compatible';

// https://docs.together.ai/docs/serverless-models#embedding-models
export type TogetherAIEmbeddingModelId =
  | 'BAAI/bge-base-en-v1.5'
  | 'BAAI/bge-large-en-v1.5'
  | 'bert-base-uncased'
  | 'sentence-transformers/msmarco-bert-base-dot-v5'
  | 'togethercomputer/m2-bert-80M-2k-retrieval'
  | 'togethercomputer/m2-bert-80M-32k-retrieval'
  | 'togethercomputer/m2-bert-80M-8k-retrieval'
  | 'WhereIsAI/UAE-Large-V1'
  | (string & {});

export interface TogetherAIEmbeddingSettings
  extends OpenAICompatibleEmbeddingSettings {}
