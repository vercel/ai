import { z } from 'zod/v4';

// https://docs.siliconflow.cn/api-reference/chat-completions/chat-completions
export type SiliconFlowChatModelId =
  | 'deepseek-ai/DeepSeek-V3'
  | 'deepseek-ai/DeepSeek-V3.2'
  | 'deepseek-ai/DeepSeek-R1'
  | 'deepseek-ai/DeepSeek-V2.5'
  | 'Qwen/Qwen2.5-7B-Instruct'
  | 'Qwen/Qwen2.5-14B-Instruct'
  | 'Qwen/Qwen2.5-32B-Instruct'
  | 'Qwen/Qwen2.5-72B-Instruct'
  | 'Qwen/Qwen3-8B'
  | 'Qwen/Qwen3-14B'
  | 'Qwen/Qwen3-32B'
  | 'Qwen/Qwen3.5-4B'
  | 'Qwen/Qwen3.5-9B'
  | 'Qwen/Qwen3.5-27B'
  | 'Qwen/Qwen3.5-35B-A3B'
  | 'Qwen/Qwen3.5-122B-A10B'
  | 'THUDM/GLM-4-9B-0414'
  | 'THUDM/GLM-4-32B-0414'
  | 'THUDM/GLM-Z1-9B-0414'
  | 'meta-llama/Llama-3.3-70B-Instruct'
  | 'internlm/internlm2_5-7b-chat'
  | (string & {});

export const siliconflowLanguageModelChatOptions = z.object({
  // SiliconFlow supports standard OpenAI-compatible parameters
  // No additional provider-specific options needed for basic usage
});

export type SiliconFlowLanguageModelChatOptions = z.infer<
  typeof siliconflowLanguageModelChatOptions
>;
