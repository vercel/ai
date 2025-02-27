import { OpenAICompatibleEmbeddingSettings } from '@ai-sdk/openai-compatible';

export type LangDBEmbeddingModelId =
  | 'openai/text-embedding-3-large'
  | 'openai/text-embedding-3-small'
  | 'openai/text-embedding-ada-002'
  | (string & {});

export interface LangDBEmbeddingSettings
  extends OpenAICompatibleEmbeddingSettings {}