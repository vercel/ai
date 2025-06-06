import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://aimlapi.com/models
// Below is just a subset of the available models.
export type AIMLAPIChatModelId =
  | 'openai/gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'gpt-4'
  | 'gpt-3.5-turbo'
  | 'o1-mini'
  | 'o3-mini'
  | 'o1'
  | 'gpt-3.5-turbo-instruct'
  | 'meta-llama/Llama-3.3-70B-Instruct-Turbo'
  | 'meta-llama/Llama-3.2-3B-Instruct-Turbo'
  | 'meta-llama/Meta-Llama-3-8B-Instruct-Lite'
  | 'meta-llama/Llama-3-8b-chat-hf'
  | 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'
  | 'meta-llama/Meta-Llama-Guard-3-8B'
  | 'google/gemma-2-27b-it'
  | 'google/gemini-1.5-flash'
  | 'google/gemini-1.5-pro'
  | 'mistralai/Mixtral-8x22B-Instruct-v0.1'
  | 'mistralai/Mistral-7B-Instruct-v0.3'
  | 'mistralai/mistral-tiny'
  | 'Qwen/Qwen2.5-7B-Instruct-Turbo'
  | 'claude-3-haiku-20240307'
  | 'claude-3-5-sonnet-20240620'
  | 'claude-3-5-sonnet-20241022'
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | 'deepseek/deepseek-prover-v2'
  | 'x-ai/grok-beta'
  | 'x-ai/grok-3-beta'
  | 'x-ai/grok-3-mini-beta'
  | (string & {});

export interface AimlapiChatSettings extends OpenAICompatibleChatSettings {}
