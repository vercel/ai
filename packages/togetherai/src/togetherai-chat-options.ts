import type { TogetherAIModelIds } from './togetherai-model-catalog';

// https://docs.together.ai/docs/serverless-models#chat-models
export type TogetherAIChatModelId =
  | TogetherAIModelIds['language']
  | (string & {});
