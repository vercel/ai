import { OpenAICompatibleChatSettings } from '@ai-sdk/openai-compatible';

// https://api-docs.deepseek.com/quick_start/pricing
export type DeepSeekChatModelId = 'deepseek-chat' | (string & {});

export interface DeepSeekChatSettings extends OpenAICompatibleChatSettings {}
