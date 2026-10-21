import {
  getDeepseekAssistantMessageOptionsSchema,
  getDeepseekChatOptionsSchema,
  getDeepseekMessageOptionsSchema,
} from '../chat/deepseek-chat-options';

export * from '../chat/deepseek-chat-language-model';
export type {
  DeepSeekAssistantMessageProviderOptions,
  DeepSeekChatModelId,
  DeepSeekLanguageModelOptions,
  DeepSeekMessageProviderOptions,
} from '../chat/deepseek-chat-options';

// Preserve the Zod object exports for consumers of the internal entry point.
export const deepseekLanguageModelOptions = getDeepseekChatOptionsSchema();
export const deepseekMessageProviderOptions = getDeepseekMessageOptionsSchema();
export const deepseekAssistantMessageProviderOptions =
  getDeepseekAssistantMessageOptionsSchema();
