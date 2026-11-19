import type { TogetherAIModelIds } from './togetherai-model-catalog';

// https://api.together.ai/models
export type TogetherAIImageModelId =
  | TogetherAIModelIds['image']
  | (string & {});
