import type { TogetherAIModelIds } from './togetherai-model-catalog';

// https://docs.together.ai/docs/serverless-models#embedding-models
export type TogetherAIEmbeddingModelId =
  | TogetherAIModelIds['embedding']
  | (string & {});
