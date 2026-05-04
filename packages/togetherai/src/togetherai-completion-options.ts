import type { TogetherAIChatModelId } from './togetherai-chat-options';

// Models that only work on the chat completions endpoint, not text completions
type CompletionExclusions =
  | 'deepseek-ai/DeepSeek-R1' // service unavailable on /v1/completions
  | 'Qwen/Qwen3.6-Plus' // streaming-only model
  | 'arize-ai/qwen-2-1.5b-instruct'; // service unavailable on /v1/completions

// https://docs.together.ai/docs/serverless-models#language-models
export type TogetherAICompletionModelId = Exclude<
  TogetherAIChatModelId,
  CompletionExclusions
>;
