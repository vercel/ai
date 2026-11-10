import type { TogetherAIModelIds } from './togetherai-model-catalog';

export type TogetherAICompletionModelId =
  | TogetherAIModelIds['language']
  | (string & {});
