import { OpenAICompatibleCompletionSettings } from '@ai-sdk/openai-compatible';

// Below is just a subset of the available models.
export type AIMLAPICompletionModelId =
  | 'gpt-4'
  | 'gpt-4-turbo'
  | 'gpt-3.5-turbo'
  | 'gpt-3.5-turbo-instruct'
  | 'o1'
  | 'o1-mini'
  | 'o3-mini'
  | 'mistralai/Mistral-7B-Instruct-v0.3'
  | 'mistralai/Mixtral-8x22B-Instruct-v0.1'
  | (string & {});


export interface AIMLAPICompletionSettings
  extends OpenAICompatibleCompletionSettings {}
