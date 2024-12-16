import { OpenAICompatibleEmbeddingSettings } from '@ai-sdk/openai-compatible';

export type FireworksEmbeddingModelId =
  | 'nomic-ai/nomic-embed-text-v1.5'
  | 'accounts/fireworks/models/text-embedding-ada-002'
  | (string & {});

export interface FireworksEmbeddingSettings
  extends OpenAICompatibleEmbeddingSettings {}
