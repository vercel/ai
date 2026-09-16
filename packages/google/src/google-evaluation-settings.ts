import type { GoogleModelId } from './google-language-model-options';

// Keep routing and embedding-model autocomplete in sync.
export const evaluationEmbeddingModelIds = {
  'gemini-embedding-2': true,
} as const;

export type GoogleEvaluationModelId =
  | GoogleModelId
  | keyof typeof evaluationEmbeddingModelIds;

export type GoogleEvaluationModelSettings = {
  /** Override backend selection for custom model IDs. Unknown IDs default to language models. */
  modelType?: 'language' | 'embedding';
};
