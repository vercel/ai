import type { OpenAIResponsesModelId } from './responses/openai-responses-language-model-options';

// Keep routing and embedding-model autocomplete in sync.
export const evaluationEmbeddingModelIds = {
  'text-embedding-3-large': true,
} as const;

export type OpenAIEvaluationModelId =
  | OpenAIResponsesModelId
  | keyof typeof evaluationEmbeddingModelIds;

export type OpenAIEvaluationModelSettings = {
  /** Override backend selection for custom model IDs. Unknown IDs default to language models. */
  modelType?: 'language' | 'embedding';
};
