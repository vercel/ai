import {
  getDeepseekAssistantMessageOptionsSchema,
  getDeepseekChatOptionsSchema,
  getDeepseekMessageOptionsSchema,
} from '../chat/deepseek-chat-language-model-options';

export * from '../chat/deepseek-chat-language-model';
export type {
  DeepSeekAssistantMessageProviderOptions,
  DeepSeekChatModelId,
  DeepSeekLanguageModelChatOptions,
  DeepSeekMessageProviderOptions,
} from '../chat/deepseek-chat-language-model-options';

// Preserve the Zod object exports for consumers of the internal entry point.
export const deepseekLanguageModelChatOptions = getDeepseekChatOptionsSchema();
export const deepseekMessageProviderOptions = getDeepseekMessageOptionsSchema();
export const deepseekAssistantMessageProviderOptions =
  getDeepseekAssistantMessageOptionsSchema();
