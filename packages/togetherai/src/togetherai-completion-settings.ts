import { OpenAICompatibleCompletionSettings } from '@ai-sdk/openai-compatible';

// https://docs.together.ai/docs/serverless-models#language-models
export type TogetherAICompletionModelId =
  | 'codellama/CodeLlama-34b-Instruct-hf'
  | 'Qwen/Qwen2.5-Coder-32B-Instruct'
  | (string & {});

export interface TogetherAICompletionSettings
  extends OpenAICompatibleCompletionSettings {}
