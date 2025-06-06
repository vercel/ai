import { OpenAICompatibleEmbeddingSettings } from '@ai-sdk/openai-compatible';

// Below is just a subset of the available models.
export type AIMLAPIEmbeddingModelId =
  | 'text-embedding-3-large'
  | 'textembedding-gecko-multilingual@001'
  | 'text-multilingual-embedding-002'
  | (string & {});


export interface AimlapiEmbeddingSettings
  extends OpenAICompatibleEmbeddingSettings {}
