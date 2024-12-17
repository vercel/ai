import { OpenAICompatibleEmbeddingSettings } from '@ai-sdk/openai-compatible';

// Below is just a subset of the available models.
export type FireworksEmbeddingModelId =
  | 'nomic-ai/nomic-embed-text-v1.5'
  | (string & {});

export interface FireworksEmbeddingSettings
  extends OpenAICompatibleEmbeddingSettings {}
