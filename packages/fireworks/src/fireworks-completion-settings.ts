import { OpenAICompatibleCompletionSettings } from '@ai-sdk/openai-compatible';

export type FireworksCompletionModelId =
  | 'accounts/fireworks/models/llama-v3-8b-instruct'
  | 'accounts/fireworks/models/llama-v2-34b-code'
  | (string & {});

export interface FireworksCompletionSettings
  extends OpenAICompatibleCompletionSettings {}
