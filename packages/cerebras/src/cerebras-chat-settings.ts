import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://inference-docs.cerebras.ai/introduction
export type CerebrasChatModelId =
  | 'llama3.1-8b'
  | 'llama3.1-70b' // available in the playground?
  | 'llama-3.3-70b'
  | (string & {});

export interface CerebrasChatSettings extends OpenAICompatibleChatSettings {}
